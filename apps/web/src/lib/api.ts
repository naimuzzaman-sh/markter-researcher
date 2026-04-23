import type { ResearchContext } from '@/types/research-context.type';
import { supabase } from '@/lib/supabase';

// Base URL of the backend API. Empty string = same-origin (legacy).
// Set VITE_API_BASE_URL=http://localhost:3001 during apps/server rollout.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

const CALLS_BASE = `${API_BASE}/calls`;
const SETUP_BASE = `${API_BASE}/setup`;
const BRIEFS_BASE = `${API_BASE}/briefs`;
const AUTH_DEVICE_BASE = `${API_BASE}/auth/device`;
const CHAT_URL = `${API_BASE}/chat`;

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

/**
 * Hand off the current Supabase session to an MCP device waiting to
 * authorize. The backend validates the access token via JwtGuard and
 * stashes { accessToken, refreshToken, tokenExpiresAt, userId } so the
 * MCP's next poll picks it up. Requires the user to be signed in.
 */
async function authorizeDevice(userCode: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error('You need to be signed in to authorize a device.');
  }
  const response = await fetch(`${AUTH_DEVICE_BASE}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      userCode,
      refreshToken: data.session.refresh_token,
      tokenExpiresAt: data.session.expires_at ?? 0,
    }),
  });
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to authorize device'));
}

async function denyDevice(userCode: string): Promise<void> {
  const response = await fetch(`${AUTH_DEVICE_BASE}/deny`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ userCode }),
  });
  if (!response.ok)
    throw new Error(await readError(response, 'Failed to deny device'));
}

// --- Universal agent chat (apps/server /chat) -------------------------------

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type ChatToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: unknown | null;
  error: string | null;
  durationMs: number;
};

type ChatResponse = {
  reply: string;
  toolCalls: ChatToolCall[];
  usage: { promptTokens: number; outputTokens: number };
};

async function postChat(
  messages: ChatMessage[],
  mode?: 'universal' | 'brief-setup',
): Promise<ChatResponse> {
  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ messages, mode }),
  });
  if (!response.ok) throw new Error(await readError(response, 'Chat failed'));
  return response.json() as Promise<ChatResponse>;
}

export {
  startCall,
  endCall,
  getCall,
  startSetup,
  sendSetupMessage,
  createBrief,
  getBrief,
  authorizeDevice,
  denyDevice,
  postChat,
};
export type {
  StartCallResponse,
  CallRecord,
  CallAnalysis,
  StartSetupResponse,
  SetupChatResponse,
  CreateBriefResponse,
  GetBriefResponse,
  ChatMessage,
  ChatToolCall,
  ChatResponse,
};
