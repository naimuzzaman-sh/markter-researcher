import type { ResearchContext } from '@/types/research-context.type';
import { supabase } from '@/lib/supabase';

const CALLS_BASE = '/calls';
const SETUP_BASE = '/setup';
const BRIEFS_BASE = '/briefs';

/**
 * Returns an Authorization header object if a Supabase session exists,
 * otherwise an empty object. Used by researcher-only endpoints.
 *
 * Routes that attach this: startSetup, sendSetupMessage, createBrief.
 * Routes that deliberately DON'T: getBrief, startCall, endCall, getCall
 *   — interviewees are anonymous and must be able to call them without auth.
 */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type StartCallResponse = {
  callId: string;
  agentId: string;
  briefId: string;
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
  briefId: string;
  conversationId: string | null;
  status: 'created' | 'in-progress' | 'processing' | 'completed' | 'failed';
  context: ResearchContext;
  transcript: Array<{
    role: 'user' | 'agent';
    message: string;
    timeInCallSecs: number;
  }>;
  analysis: CallAnalysis | null;
  createdAt: string;
  completedAt: string | null;
};

type StartSetupResponse = {
  sessionId: string;
  firstMessage: string;
};

type SetupChatResponse = {
  reply: string;
  context?: ResearchContext;
  done: boolean;
};

type CreateBriefResponse = {
  briefId: string;
};

type GetBriefResponse = {
  briefId: string;
  researchContext: ResearchContext;
  createdAt: string;
};

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  // Clone so we can read the body twice if needed (json first, then text fallback).
  const clone = response.clone();
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.join('; ');
    // JSON but no recognizable message — dump for console debugging.
    console.error('[api] unexpected error body', body);
  } catch {
    // Not JSON — dump the raw text so we can see what the server returned.
    try {
      const raw = await clone.text();
      console.error('[api] non-JSON error response', {
        status: response.status,
        body: raw.slice(0, 1000),
      });
    } catch {
      // ignore
    }
  }
  return `${fallback} (HTTP ${response.status})`;
}

async function startSetup(): Promise<StartSetupResponse> {
  const response = await fetch(`${SETUP_BASE}/start`, {
    method: 'POST',
    headers: { ...(await authHeader()) },
  });
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to start setup'));
  return response.json() as Promise<StartSetupResponse>;
}

async function sendSetupMessage(
  sessionId: string,
  message: string,
): Promise<SetupChatResponse> {
  const response = await fetch(`${SETUP_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ sessionId, message }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, 'Failed to send setup message'));
  }
  return response.json() as Promise<SetupChatResponse>;
}

async function createBrief(
  context: ResearchContext,
): Promise<CreateBriefResponse> {
  const response = await fetch(BRIEFS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ context }),
  });
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to create brief'));
  return response.json() as Promise<CreateBriefResponse>;
}

async function getBrief(briefId: string): Promise<GetBriefResponse> {
  const response = await fetch(`${BRIEFS_BASE}/${briefId}`);
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to load brief'));
  return response.json() as Promise<GetBriefResponse>;
}

async function startCall(briefId: string): Promise<StartCallResponse> {
  const response = await fetch(`${CALLS_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ briefId }),
  });
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to start call'));
  return response.json() as Promise<StartCallResponse>;
}

async function endCall(
  callId: string,
  conversationId: string,
): Promise<CallRecord> {
  const response = await fetch(`${CALLS_BASE}/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  });
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to end call'));
  return response.json() as Promise<CallRecord>;
}

async function getCall(callId: string): Promise<CallRecord> {
  const response = await fetch(`${CALLS_BASE}/${callId}`);
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to get call'));
  return response.json() as Promise<CallRecord>;
}

export {
  startCall,
  endCall,
  getCall,
  startSetup,
  sendSetupMessage,
  createBrief,
  getBrief,
};
export type {
  StartCallResponse,
  CallRecord,
  CallAnalysis,
  StartSetupResponse,
  SetupChatResponse,
  CreateBriefResponse,
  GetBriefResponse,
};
