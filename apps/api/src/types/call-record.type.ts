import type { CallAnalysis } from './call-analysis.type';

type TranscriptEntry = {
  role: 'user' | 'agent';
  message: string;
  timeInCallSecs: number;
};

type CallStatus = 'created' | 'in-progress' | 'processing' | 'completed' | 'failed';

type CallRecord = {
  id: string;
  agentId: string;
  conversationId: string | null;
  status: CallStatus;
  transcript: TranscriptEntry[];
  analysis: CallAnalysis | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type { CallRecord, CallStatus, TranscriptEntry };
