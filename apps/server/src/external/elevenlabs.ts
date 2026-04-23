import { AppError } from '../lib/errors';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ElevenLabs Convai integration: create/delete per-brief voice agents, and
 * verify webhook signatures for post-call events. No SDK — plain fetch.
 */

const BASE = 'https://api.elevenlabs.io/v1/convai';

type CreateAgentInput = {
  apiKey: string;
  voiceId: string;
  systemPrompt: string;
  firstMessage: string;
  language: string;
};

export async function createElevenLabsAgent(input: CreateAgentInput): Promise<string> {
  const body = {
    conversation_config: {
      agent: {
        prompt: {
          prompt: input.systemPrompt,
          tools: [
            {
              type: 'system',
              name: 'end_call',
              description:
                'Hang up the call after the closing thanks, once the interview is clearly finished.',
            },
          ],
        },
        first_message: input.firstMessage,
        language: input.language,
      },
      tts: { voice_id: input.voiceId },
      turn: { turn_timeout: 12, silence_end_call_timeout: -1 },
    },
  };

  const res = await fetch(`${BASE}/agents/create`, {
    method: 'POST',
    headers: { 'xi-api-key': input.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `ElevenLabs agent create failed: ${res.status} ${res.statusText}${t ? ` - ${t}` : ''}`,
    );
  }
  const data = (await res.json()) as { agent_id?: string };
  if (!data.agent_id) {
    throw new AppError('upstream', 'ElevenLabs agent create response missing agent_id');
  }
  return data.agent_id;
}

export async function deleteElevenLabsAgent(apiKey: string, agentId: string): Promise<void> {
  await fetch(`${BASE}/agents/${agentId}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': apiKey },
  });
  // Deletion failures are non-fatal — log in caller if needed; leaving an
  // orphan agent costs nothing and will be garbage-collected by ElevenLabs.
}

/**
 * Constant-time HMAC-SHA256 webhook signature verification.
 * ElevenLabs signs webhook bodies with the shared secret; we compare.
 * Returns false if signatures don't match or secret is empty (fail-closed).
 */
export function verifyElevenLabsWebhook(
  secret: string,
  rawBody: string,
  providedSignature: string,
): boolean {
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSignature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
