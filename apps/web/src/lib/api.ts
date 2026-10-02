import type { ResearchContext } from '@/types/research-context.type';
import { supabase } from '@/lib/supabase';

// Base URL of the backend API. Empty string = same-origin (legacy).
// Set VITE_API_BASE_URL=http://localhost:3001 during apps/server rollout.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

const CALLS_BASE = `${API_BASE}/calls`;
// Public-read URL for studies. Server also keeps `/briefs/<id>` as a
// legacy alias so old invite emails (issued before the brief→study
// rename) don't 404 — but new code should always hit `/studies/<id>`.
const STUDIES_BASE = `${API_BASE}/studies`;
const AUTH_DEVICE_BASE = `${API_BASE}/auth/device`;
const CHAT_URL = `${API_BASE}/chat`;

/**
 * Returns an Authorization header object if a Supabase session exists,
 * otherwise an empty object. Used by researcher-only endpoints
 * (`postChat`, `authorizeDevice`, `denyDevice`). Interviewee routes
 * (`getStudy`, `startCall`, `endCall`) deliberately DON'T attach auth —
 * those users are anonymous.
 */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type StartCallResponse = {
  callId: string;
  agentId: string;
  studyId: string;
  signedUrl: string;
  status: string;
};

type CallAnalysis = {
  participant: { inferredRole: string; background: string };
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
  studyId: string;
  conversationId: string | null;
  status: 'created' | 'in-progress' | 'processing' | 'completed' | 'failed';
  context: ResearchContext;
  transcript: Array<{ role: 'user' | 'agent'; message: string; timeInCallSecs: number }>;
  analysis: CallAnalysis | null;
  createdAt: string;
  completedAt: string | null;
};

type GetStudyResponse = {
  studyId: string;
  researchContext: ResearchContext;
  createdAt: string;
};

async function readError(response: Response, fallback: string): Promise<string> {
  const clone = response.clone();
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.join('; ');
    console.error('[api] unexpected error body', body);
  } catch {
    try {
      const raw = await clone.text();
      console.error('[api] non-JSON error response', {
        status: response.status,
        body: raw.slice(0, 1000),
      });
    } catch {
      /* ignore */
    }
  }
  return `${fallback} (HTTP ${response.status})`;
}

async function getStudy(studyId: string): Promise<GetStudyResponse> {
  const response = await fetch(`${STUDIES_BASE}/${studyId}`);
  if (!response.ok) throw new Error(await readError(response, 'Failed to load study'));
  return response.json() as Promise<GetStudyResponse>;
}

async function startCall(
  studyId: string,
  candidateId?: string,
): Promise<StartCallResponse> {
  const response = await fetch(`${CALLS_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // candidateId is forwarded only when the interviewee landed via an
    // invite URL (`/interview/<studyId>?cid=...`); the server uses it to
    // attribute the interview back to the candidate row when the call ends.
    body: JSON.stringify(candidateId ? { studyId, candidateId } : { studyId }),
  });
  if (!response.ok) throw new Error(await readError(response, 'Failed to start call'));
  return response.json() as Promise<StartCallResponse>;
}

async function endCall(callId: string, conversationId: string): Promise<CallRecord> {
  const response = await fetch(`${CALLS_BASE}/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  });
  if (!response.ok) throw new Error(await readError(response, 'Failed to end call'));
  return response.json() as Promise<CallRecord>;
}

/**
 * Hand off the current Supabase session to a pending MCP device-flow
 * request (identified by userCode). Server maps userCode → Mcp-Session-Id
 * and stashes the tokens so the waiting tool call wakes instantly.
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
  if (!response.ok) throw new Error(await readError(response, 'Failed to authorize device'));
}

async function denyDevice(userCode: string): Promise<void> {
  const response = await fetch(`${AUTH_DEVICE_BASE}/deny`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ userCode }),
  });
  if (!response.ok) throw new Error(await readError(response, 'Failed to deny device'));
}

// --- Universal agent chat (apps/server /chat) -------------------------------

/**
 * The chat route picks AT MOST ONE artifact per assistant turn — the last
 * successful tool call that returned a known entity shape. Raw tool-call
 * history is intentionally NOT on the wire: the client renders only
 * `reply` + (optionally) `artifact`. Everything else is internal mechanism.
 */
type ArtifactType =
  | 'study.list'
  | 'study.detail'
  | 'candidate.list'
  | 'candidate.detail'
  | 'candidate.mutation'
  | 'contact.list'
  | 'contact.detail'
  | 'interview.list'
  | 'interview.detail'
  | 'job.status'
  | 'dashboard';

type Artifact = {
  type: ArtifactType;
  data: unknown;
};

type EntityKind = 'study' | 'candidate' | 'contact' | 'interview' | 'job';

type ScopeEntity = {
  kind: EntityKind;
  id: string;
  name?: string;
};

/**
 * Structured "what was on screen" reference. Server emits one per
 * artifact-bearing assistant turn. Client stores it on the assistant
 * Turn and sends it back on the next postChat — the agent uses these
 * IDs as authoritative when the user references entities vaguely.
 *
 * Flat entity list works for both list-type artifacts (one entity per
 * item) and detail-type artifacts (focal entity + parent). The server
 * dedupes across the conversation when building "Entities in scope".
 */
type ArtifactRef = {
  type: ArtifactType;
  entities: ScopeEntity[];
};

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; artifactRef?: ArtifactRef };

type ChatResponse = {
  reply: string;
  artifact: Artifact | null;
  artifactRef: ArtifactRef | null;
  usage: { promptTokens: number; outputTokens: number };
};

async function postChat(messages: ChatMessage[]): Promise<ChatResponse> {
  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) throw new Error(await readError(response, 'Chat failed'));
  return response.json() as Promise<ChatResponse>;
}

const RUN_TOOL_URL = `${API_BASE}/run-tool`;

type RunToolResponse = {
  reply: string;
  artifact: Artifact | null;
  artifactRef: ArtifactRef | null;
};

/**
 * Deterministic tool execution. Used by pill clicks where the tool name
 * and args are known at the click site — bypasses the LLM in /chat.
 *
 * Same artifact/artifactRef shape as ChatResponse, so the resulting
 * synthetic assistant turn appears identical to an LLM-produced one.
 *
 * `displayText` is optional — when supplied it gets persisted as the
 * implied user turn for study-anchored chats so the audit trail reads
 * sensibly ("List candidates for Dynt" → list output) instead of a
 * bare assistant turn appearing without preceding context. The server
 * decides whether to persist based on whether the tool references a
 * study; the client doesn't track anchor state.
 */
async function runTool(
  name: string,
  args: Record<string, unknown>,
  options?: { displayText?: string },
): Promise<RunToolResponse> {
  const body: Record<string, unknown> = { name, args };
  if (options?.displayText) body.displayText = options.displayText;
  const response = await fetch(RUN_TOOL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response, 'Action failed'));
  return response.json() as Promise<RunToolResponse>;
}

/**
 * What a pill or card click resolves to. Discriminated so the chat shell
 * can dispatch deterministically — tool actions hit /run-tool, prompts
 * hit /chat, externals hit window.* directly, copy puts text on the
 * clipboard with no chat side-effect.
 */
type PillAction =
  | {
      kind: 'tool';
      toolName: string;
      toolArgs: Record<string, unknown>;
      displayText: string;
    }
  | { kind: 'prompt'; text: string }
  | { kind: 'href'; url: string }
  | { kind: 'mailto'; address: string }
  | { kind: 'copy'; text: string }
  /**
   * In-app SPA navigation. Used for cross-route links (e.g. landing
   * → assistant). Distinct from `href` (external, new tab).
   */
  | { kind: 'navigate'; url: string }
  /**
   * Resume editing a study. Replaces current chat turns with the
   * study's persisted chat_history, then sends "Edit study: <name>"
   * as the next user message so the agent has the full prior context
   * AND a clear instruction to keep going. Replacement is intentional
   * — the user is switching focus to this study's conversation;
   * pre-existing universal-chat turns aren't part of this study's
   * thread.
   */
  | {
      kind: 'edit-study';
      studyId: string;
      productName: string;
      chatHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
        artifact?: unknown;
        artifactRef?: unknown;
      }>;
    };

export {
  startCall,
  endCall,
  getStudy,
  authorizeDevice,
  denyDevice,
  postChat,
  runTool,
};
export type {
  StartCallResponse,
  CallRecord,
  CallAnalysis,
  GetStudyResponse,
  ChatMessage,
  ChatResponse,
  RunToolResponse,
  PillAction,
  Artifact,
  ArtifactType,
  ArtifactRef,
  ScopeEntity,
  EntityKind,
};
