import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResearchContext, TranscriptEntry } from '@mirrars/shared';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import { AppError } from '../lib/errors';
import { getStudyById } from '../db/studies';
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
import { summarizeStudy } from '../agent/summarize-study';

type CallRecord = {
  id: string;
  studyId: string;
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
    studyId: z.string().uuid(),
    // Optional — present when the interviewee landed via an invite URL
    // (`/interview/<studyId>?cid=<candidateId>`). Lets us attribute the
    // completed interview back to the candidate row in `/calls/:id/end`.
    candidateId: z.string().uuid().optional(),
  });
  const endBody = z.object({ conversationId: z.string().min(1) });

  const app = new Hono();

  app.post('/calls/start', async (c) => {
    const parsed = startBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'Invalid body');

    const study = await getStudyById(deps.supabase, parsed.data.studyId);
    if (!study) throw new AppError('not_found', 'Study not found');

    const agentId = await createElevenLabsAgent({
      apiKey: deps.config.elevenlabsApiKey,
      voiceId: deps.config.elevenlabsVoiceId,
      systemPrompt: buildInterviewPrompt(study.researchContext),
      firstMessage: buildFirstMessage(study.researchContext),
      language: study.researchContext.interviewSettings.language,
    });

    const signedUrl = await getSignedUrl(deps.config.elevenlabsApiKey, agentId);

    const record: CallRecord = {
      id: randomUUID(),
      studyId: study.id,
      candidateId: parsed.data.candidateId ?? null,
      agentId,
      context: study.researchContext,
      createdAt: new Date(),
    };
    inFlight.set(record.id, record);

    return c.json({
      callId: record.id,
      agentId: record.agentId,
      signedUrl,
      studyId: study.id,
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

    // Stage 1: transcript polling. This is the interview itself —
    // failure here means the call genuinely didn't produce content,
    // and `failed` is the correct status.
    try {
      transcript = await pollForTranscript(
        deps.config.elevenlabsApiKey,
        parsed.data.conversationId,
        { intervalMs: POLL_INTERVAL_MS, maxAttempts: POLL_MAX_ATTEMPTS },
      );
      if (transcript.length === 0) {
        status = 'failed';
        logger.warn('Conversation ended with empty transcript');
      }
    } catch (err) {
      status = 'failed';
      logger.error('transcript polling failed', { err });
    }

    // Stage 2: analysis. ONLY runs if we have a transcript. Failure
    // here is enrichment-level — the interview itself succeeded
    // (we have the transcript). Don't mark the row as failed for a
    // transient Gemini outage / 503 — that misleads the user into
    // thinking the call didn't go through. Just leave analysis null;
    // the transcript is still recoverable, and a future re-analysis
    // path can fill it in if/when we add one.
    if (status === 'completed' && transcript.length > 0) {
      try {
        analysis = await analyzeTranscript(
          deps.config.openaiApiKey,
          transcript,
          record.context.research.questions,
        );
      } catch (err) {
        logger.warn('analyzeTranscript failed (interview kept as completed)', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const completedAt = new Date();
    const durationSecs = Math.round((completedAt.getTime() - record.createdAt.getTime()) / 1000);

    let interviewId: string | null = null;
    try {
      interviewId = await saveInterview(deps.supabase, {
        callId: record.id,
        agentId: record.agentId,
        studyId: record.studyId,
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
          .from('study_candidates')
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

    // Fire-and-forget: re-synthesize study-level findings across all
    // completed interviews. Triggered after every successful interview;
    // the latest run overwrites `studies.results`. Failures are logged
    // but never block the response — the interview itself is the
    // user-facing artifact, the synthesis is enrichment.
    if (status === 'completed' && interviewId) {
      void summarizeStudy({
        apiKey: deps.config.openaiApiKey,
        supabase: deps.supabase,
        studyId: record.studyId,
      })
        .then((results) => {
          if (results) {
            logger.info('study summarized', {
              studyId: record.studyId,
              interviewCount: results.interviewCount,
            });
          }
        })
        .catch((err) => {
          logger.warn('study summarize failed', {
            studyId: record.studyId,
            err: err instanceof Error ? err.message : String(err),
          });
        });
    }

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
