const API_BASE = '/calls';

type StartCallResponse = {
  callId: string;
  agentId: string;
  signedUrl: string;
  status: string;
};

type CallAnalysis = {
  participant: {
    inferredRole: string;
    background: string;
  };
  answers: Array<{
    questionId: string;
    questionText: string;
    response: string;
    sentiment: 'positive' | 'neutral' | 'negative';
  }>;
  keyInsights: string[];
  productMarketFitSignals: string[];
  suggestedFollowUps: string[];
  overallSentiment: 'positive' | 'neutral' | 'negative';
};

type CallRecord = {
  id: string;
  agentId: string;
  conversationId: string | null;
  status: 'created' | 'in-progress' | 'processing' | 'completed' | 'failed';
  transcript: Array<{
    role: 'user' | 'agent';
    message: string;
    timeInCallSecs: number;
  }>;
  analysis: CallAnalysis | null;
  createdAt: string;
  completedAt: string | null;
};

async function startCall(): Promise<StartCallResponse> {
  const response = await fetch(`${API_BASE}/start`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to start call');
  return response.json() as Promise<StartCallResponse>;
}

async function endCall(callId: string, conversationId: string): Promise<CallRecord> {
  const response = await fetch(`${API_BASE}/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  });
  if (!response.ok) throw new Error('Failed to end call');
  return response.json() as Promise<CallRecord>;
}

async function getCall(callId: string): Promise<CallRecord> {
  const response = await fetch(`${API_BASE}/${callId}`);
  if (!response.ok) throw new Error('Failed to get call');
  return response.json() as Promise<CallRecord>;
}

export { startCall, endCall, getCall };
export type { StartCallResponse, CallRecord, CallAnalysis };
