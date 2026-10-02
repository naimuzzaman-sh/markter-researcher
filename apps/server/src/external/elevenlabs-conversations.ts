import type { TranscriptEntry } from '@mirrars/shared';
import { AppError } from '../lib/errors';

/**
 * Extra ElevenLabs endpoints beyond agent create/delete: signed-URL for
 * Convai WebRTC kickoff, and the conversation endpoint for post-call
 * transcript retrieval with polling.
 */

const BASE = 'https://api.elevenlabs.io/v1/convai';

export async function getSignedUrl(apiKey: string, agentId: string): Promise<string> {
  const res = await fetch(
    `${BASE}/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': apiKey } },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `ElevenLabs signed URL failed: ${res.status} ${res.statusText}${t ? ` - ${t}` : ''}`,
    );
  }
  const data = (await res.json()) as { signed_url?: string };
  if (!data.signed_url) throw new AppError('upstream', 'Signed URL missing from response');
  return data.signed_url;
}

type ElevenLabsTranscriptEntry = {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
};

type ConversationResponse = {
  transcript: ElevenLabsTranscriptEntry[];
  status?: string;
};

export async function fetchConversation(
  apiKey: string,
  conversationId: string,
): Promise<{ transcript: TranscriptEntry[]; finalized: boolean }> {
  const res = await fetch(`${BASE}/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) {
    throw new AppError(
      'upstream',
      `Failed to fetch conversation ${conversationId}: ${res.status}`,
    );
  }
  const data = (await res.json()) as ConversationResponse;
  const transcript = (data.transcript ?? []).map((e) => ({
    role: e.role,
    message: e.message,
    timeInCallSecs: e.time_in_call_secs,
  }));
  const finalized = data.status === 'done' || data.status === 'completed';
  return { transcript, finalized };
}

/**
 * Poll the conversation until transcript is populated or a terminal status is
 * reached. ElevenLabs typically needs 2–10s after hangup.
 */
export async function pollForTranscript(
  apiKey: string,
  conversationId: string,
  { intervalMs, maxAttempts }: { intervalMs: number; maxAttempts: number },
): Promise<TranscriptEntry[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { transcript, finalized } = await fetchConversation(apiKey, conversationId);
      if (transcript.length > 0 || finalized) return transcript;
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  return [];
}
