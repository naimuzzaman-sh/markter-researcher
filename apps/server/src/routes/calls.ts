import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResearchContext, TranscriptEntry } from '@mirrars/shared';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import { AppError } from '../lib/errors';
import { getBriefById } from '../db/briefs';
import { saveInterview } from '../db/interviews';
import {
  createElevenLabsAgent,
  deleteElevenLabsAgent,
} from '../external/elevenlabs';
import {
  getSignedUrl,
  pollForTranscript,
} from '../external/elevenlabs-conversations';
import {
  buildInterviewPrompt,
  buildFirstMessage,
} from '../agent/interview-prompt';
import { analyzeTranscript } from '../agent/analyze-transcript';

type CallRecord = {
  id: string;
  briefId: string;
  /** Candidate the interviewee was invited as (from `?cid=` on the URL). */
  candidateId: string | null;
  agentId: string;
  context: ResearchContext;
  createdAt: Date;
};

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

/**
 * Public interviewee call-flow routes. Tracks in-flight calls in an
 * in-memory map keyed by callId; a fresh `agentId` is minted per call.
 *
 * Not exposed to MCP — calls are strictly a web-UI concern (interviewee
 * kicks off from the interview landing page).
 */
export function createCallsRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  const inFlight = new Map<string, CallRecord>();

  const startBody = z.object({
    briefId: z.string().uuid(),
    // Optional — present when the interviewee landed via an invite URL
    // (`/interview/<briefId>?cid=<candidateId>`). Lets us attribute the
    // completed interview back to the candidate row in `/calls/:id/end`.
    candidateId: z.string().uuid().optional(),
  });
  const endBody = z.object({ conversationId: z.string().min(1) });

  const app = new Hono();

  app.post('/calls/start', async (c) => {
    const parsed = startBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'Invalid body');

    const brief = await getBriefById(deps.supabase, parsed.data.briefId);
    if (!brief) throw new AppError('not_found', 'Brief not found');

    const agentId = await createElevenLabsAgent({
      apiKey: deps.config.elevenlabsApiKey,
      voiceId: deps.config.elevenlabsVoiceId,
      systemPrompt: buildInterviewPrompt(brief.researchContext),
      firstMessage: buildFirstMessage(brief.researchContext),
      language: brief.researchContext.interviewSettings.language,
    });

    const signedUrl = await getSignedUrl(deps.config.elevenlabsApiKey, agentId);

    const record: CallRecord = {
      id: randomUUID(),
      briefId: brief.id,
      candidateId: parsed.data.candidateId ?? null,
      agentId,
      context: brief.researchContext,
      createdAt: new Date(),
    };
    inFlight.set(record.id, record);

    return c.json({
      callId: record.id,
      agentId: record.agentId,
      signedUrl,
      briefId: brief.id,
    });
  });

  app.post('/calls/:id/end', async (c) => {
    const callId = c.req.param('id');
    const parsed = endBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'Invalid body');

    const record = inFlight.get(callId);
    if (!record) throw new AppError('not_found', 'Call not found');

    const logger = deps.logger.child({ callId, agentId: record.agentId });
    let transcript: TranscriptEntry[] = [];
    let status: 'completed' | 'failed' = 'completed';
    let analysis: Awaited<ReturnType<typeof analyzeTranscript>> | null = null;

    try {
      transcript = await pollForTranscript(
        deps.config.elevenlabsApiKey,
        parsed.data.conversationId,
        { intervalMs: POLL_INTERVAL_MS, maxAttempts: POLL_MAX_ATTEMPTS },
      );
      if (transcript.length === 0) {
        status = 'failed';
        logger.warn('Conversation ended with empty transcript');
      } else {
        analysis = await analyzeTranscript(
          deps.config.geminiApiKey,
          transcript,
          record.context.research.questions,
        );
      }
    } catch (err) {
      status = 'failed';
      logger.error('endCall failed', { err });
    }

    const completedAt = new Date();
    const durationSecs = Math.round((completedAt.getTime() - record.createdAt.getTime()) / 1000);

    let interviewId: string | null = null;
    try {
      interviewId = await saveInterview(deps.supabase, {
        callId: record.id,
        agentId: record.agentId,
        briefId: record.briefId,
        conversationId: parsed.data.conversationId,
        status,
        researchContext: record.context,
        transcript,
        analysis,
        durationSecs,
        completedAt,
      });
    } catch (err) {
      logger.error('persistInterview failed', { err });
    }

    // If the interviewee arrived via an invite link, attribute the
    // interview back to the candidate row and advance their status.
    if (record.candidateId && interviewId && status === 'completed') {
      try {
        const { error } = await deps.supabase
          .from('brief_candidates')
          .update({ interview_id: interviewId, status: 'interviewed' })
          .eq('id', record.candidateId);
        if (error) throw error;
      } catch (err) {
        logger.error('candidate attribution failed', {
          candidateId: record.candidateId,
          err,
        });
      }
    }

    // Fire-and-forget agent cleanup.
    void deleteElevenLabsAgent(deps.config.elevenlabsApiKey, record.agentId).catch(() => {});
    inFlight.delete(callId);

    return c.json({
      callId: record.id,
      status,
      durationSecs,
      transcriptLength: transcript.length,
      hasAnalysis: !!analysis,
    });
  });

  return app;
}
