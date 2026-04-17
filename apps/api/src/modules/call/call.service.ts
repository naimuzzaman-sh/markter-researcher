import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentFactoryService } from '../agent/agent-factory.service';
import { AnalysisService } from '../analysis/analysis.service';
import { SupabaseService } from '../persistence/supabase.service';
import type { CallRecord, TranscriptEntry } from '../../types/call-record.type';
import type { ResearchContext } from '../../types/research-context.type';
import type { SavedInterview } from '../../types/saved-interview.type';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1/convai';

type ElevenLabsTranscriptEntry = {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
};

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);
  private readonly calls = new Map<string, CallRecord>();

  constructor(
    private readonly agentFactory: AgentFactoryService,
    private readonly analysisService: AnalysisService,
    private readonly persistence: SupabaseService,
    private readonly elevenLabsApiKey: string,
  ) {}

  async startCall(
    context: ResearchContext,
  ): Promise<CallRecord & { signedUrl: string }> {
    const agentId = await this.agentFactory.createAgent(context);
    const signedUrl = await this.getSignedUrl(agentId);

    const record: CallRecord = {
      id: randomUUID(),
      agentId,
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

  async endCall(callId: string, conversationId: string): Promise<CallRecord> {
    const record = this.calls.get(callId);
    if (!record) {
      throw new Error('Call not found');
    }

    record.conversationId = conversationId;
    record.status = 'processing';

    try {
      const transcript = await this.fetchTranscript(conversationId);
      record.transcript = transcript;

      const analysis = await this.analysisService.analyzeTranscript(
        transcript,
        record.context.research.questions,
      );
      record.analysis = analysis;
      record.status = 'completed';
      record.completedAt = new Date();
    } catch {
      record.status = 'failed';
    }

    await this.persistInterview(record).catch((err) => {
      this.logger.error(
        `Failed to persist interview ${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    await this.agentFactory.deleteAgent(record.agentId).catch(() => {});

    return record;
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

  private async fetchTranscript(conversationId: string): Promise<TranscriptEntry[]> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/conversations/${conversationId}`,
      {
        headers: { 'xi-api-key': this.elevenLabsApiKey },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch transcript: ${response.status}`);
    }

    const data = (await response.json()) as {
      transcript: ElevenLabsTranscriptEntry[];
    };

    return data.transcript.map((entry) => ({
      role: entry.role,
      message: entry.message,
      timeInCallSecs: entry.time_in_call_secs,
    }));
  }
}
