import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentFactoryService } from '../agent/agent-factory.service';
import { AnalysisService } from '../analysis/analysis.service';
import { SupabaseService } from '../persistence/supabase.service';
import { BriefsService } from '../briefs/briefs.service';
import type { CallRecord, TranscriptEntry } from '../../types/call-record.type';
import type { SavedInterview } from '../../types/saved-interview.type';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1/convai';

// ElevenLabs needs a few seconds after hang-up to finalize the conversation
// (transcript + analysis + status=done). We poll until it's ready.
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_MAX_ATTEMPTS = 15; // 15 * 2s = 30s ceiling

type EndCallOptions = {
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
};

type ElevenLabsTranscriptEntry = {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
};

type ElevenLabsConversationResponse = {
  transcript: ElevenLabsTranscriptEntry[];
  status?: string;
};

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);
  private readonly calls = new Map<string, CallRecord>();

  constructor(
    private readonly agentFactory: AgentFactoryService,
    private readonly analysisService: AnalysisService,
    private readonly persistence: SupabaseService,
    private readonly briefsService: BriefsService,
    private readonly elevenLabsApiKey: string,
  ) {}

  async startCall(
    briefId: string,
  ): Promise<CallRecord & { signedUrl: string }> {
    const brief = await this.briefsService.getBrief(briefId);
    if (!brief) {
      throw new NotFoundException(`Brief ${briefId} not found`);
    }

    const context = brief.researchContext;
    const agentId = await this.agentFactory.createAgent(context);
    const signedUrl = await this.getSignedUrl(agentId);

    const record: CallRecord = {
      id: randomUUID(),
      agentId,
      briefId,
      conversationId: null,
      status: 'created',
      context,
      transcript: [],
      analysis: null,
      createdAt: new Date(),
      completedAt: null,
    };

    this.calls.set(record.id, record);
    return { ...record, signedUrl };
  }

  private async getSignedUrl(agentId: string): Promise<string> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/conversation/get-signed-url?agent_id=${agentId}`,
      {
        headers: { 'xi-api-key': this.elevenLabsApiKey },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get signed URL: ${response.status} - ${errorText}`,
      );
    }

    const data = (await response.json()) as { signed_url: string };
    return data.signed_url;
  }

  getCall(callId: string): CallRecord | null {
    return this.calls.get(callId) ?? null;
  }

  async endCall(
    callId: string,
    conversationId: string,
    options: EndCallOptions = {},
  ): Promise<CallRecord> {
    const record = this.calls.get(callId);
    if (!record) {
      throw new Error('Call not found');
    }

    record.conversationId = conversationId;
    record.status = 'processing';

    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const pollMaxAttempts =
      options.pollMaxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS;

    try {
      const transcript = await this.pollForTranscript(
        conversationId,
        pollIntervalMs,
        pollMaxAttempts,
      );
      record.transcript = transcript;

      if (transcript.length === 0) {
        // Nothing was said — don't run analysis on empty input.
        this.logger.warn(
          `Conversation ${conversationId} finished with empty transcript`,
        );
        record.status = 'failed';
      } else {
        const analysis = await this.analysisService.analyzeTranscript(
          transcript,
          record.context.research.questions,
        );
        record.analysis = analysis;
        record.status = 'completed';
      }
    } catch (err) {
      this.logger.error(
        `endCall failed for ${callId} (conv ${conversationId}): ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      record.status = 'failed';
    }

    // Always stamp completedAt so the DB row has a meaningful duration,
    // even for failed runs.
    record.completedAt = new Date();

    await this.persistInterview(record).catch((err) => {
      this.logger.error(
        `Failed to persist interview ${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    await this.agentFactory.deleteAgent(record.agentId).catch(() => {});

    return record;
  }

  /**
   * Poll the conversations endpoint until:
   *   - the transcript has at least one turn, OR
   *   - status signals the conversation is finalized (done / completed), OR
   *   - we hit pollMaxAttempts.
   *
   * ElevenLabs typically needs 2–10s after disconnect to populate the transcript
   * and analysis. Fetching too eagerly returns an empty transcript with the
   * conversation still in a processing state.
   */
  private async pollForTranscript(
    conversationId: string,
    intervalMs: number,
    maxAttempts: number,
  ): Promise<TranscriptEntry[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await this.fetchConversation(conversationId);
        const transcript = (data.transcript ?? []).map((entry) => ({
          role: entry.role,
          message: entry.message,
          timeInCallSecs: entry.time_in_call_secs,
        }));
        const finalized =
          data.status === 'done' || data.status === 'completed';

        if (transcript.length > 0 || finalized) {
          return transcript;
        }
        // Still processing with empty transcript — wait and retry.
      } catch (err) {
        lastError = err;
        // Fall through to retry; intermittent 4xx/5xx are common right after hangup.
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    if (lastError) {
      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
    }
    // Exhausted attempts with no error but also no transcript — treat as empty.
    return [];
  }

  private async fetchConversation(
    conversationId: string,
  ): Promise<ElevenLabsConversationResponse> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/conversations/${conversationId}`,
      {
        headers: { 'xi-api-key': this.elevenLabsApiKey },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch conversation ${conversationId}: ${response.status}`,
      );
    }

    return (await response.json()) as ElevenLabsConversationResponse;
  }

  private async persistInterview(record: CallRecord): Promise<void> {
    if (record.status !== 'completed' && record.status !== 'failed') {
      return;
    }

    const durationSecs =
      record.completedAt !== null
        ? Math.round(
            (record.completedAt.getTime() - record.createdAt.getTime()) / 1000,
          )
        : null;

    const saved: SavedInterview = {
      callId: record.id,
      agentId: record.agentId,
      briefId: record.briefId,
      conversationId: record.conversationId,
      status: record.status,
      researchContext: record.context,
      transcript: record.transcript,
      analysis: record.analysis,
      durationSecs,
      completedAt: record.completedAt,
    };

    await this.persistence.saveInterview(saved);
  }
}
