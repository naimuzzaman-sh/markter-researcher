import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentFactoryService } from '../agent/agent-factory.service';
import { AnalysisService } from '../analysis/analysis.service';
import type { CallRecord, TranscriptEntry } from '../../types/call-record.type';
import type { ResearchContext } from '../../types/research-context.type';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1/convai';

type ElevenLabsTranscriptEntry = {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
};

@Injectable()
export class CallService {
  private readonly calls = new Map<string, CallRecord>();

  constructor(
    private readonly agentFactory: AgentFactoryService,
    private readonly analysisService: AnalysisService,
    private readonly researchContext: ResearchContext,
    private readonly elevenLabsApiKey: string,
  ) {}

  async startCall(): Promise<CallRecord & { signedUrl: string }> {
    const agentId = await this.agentFactory.createAgent(this.researchContext);
    const signedUrl = await this.getSignedUrl(agentId);

    const record: CallRecord = {
      id: randomUUID(),
      agentId,
      conversationId: null,
      status: 'created',
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
        this.researchContext.research.questions,
      );
      record.analysis = analysis;
      record.status = 'completed';
      record.completedAt = new Date();
    } catch {
      record.status = 'failed';
    }

    await this.agentFactory.deleteAgent(record.agentId).catch(() => {});

    return record;
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
