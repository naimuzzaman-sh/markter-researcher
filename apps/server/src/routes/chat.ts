import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { runAgent, type ChatTurnInput } from '../agent/run-agent';
import { SYSTEM_PROMPT } from '../agent/prompts';
import { artifactToRef, pickArtifact } from '../agent/artifact';

// Structured artifact reference echoed back on each assistant turn.
// Round-trips through the wire so subsequent /chat calls let the agent
// see "Entities in scope" without re-doing name → id resolution. Flat
// list of (kind, id, name) entities — uniform shape for list, detail,
// and mutation artifacts.
const scopeEntitySchema = z.object({
  kind: z.enum(['brief', 'candidate', 'contact', 'interview', 'job']),
  id: z.string().min(1),
  name: z.string().optional(),
});

const artifactRefSchema = z.object({
  type: z.enum([
    'brief.list',
    'brief.detail',
    'candidate.list',
    'candidate.detail',
    'candidate.mutation',
    'contact.list',
    'contact.detail',
    'interview.list',
    'interview.detail',
    'job.status',
    // Dashboard fires on AgentChat mount and produces an artifactRef
    // carrying the recent briefs / pending candidates / recent
    // interviews as scope entities. Without this enum value, the very
    // first follow-up turn after dashboard load fails Zod validation.
    'dashboard',
  ]),
  entities: z.array(scopeEntitySchema).default([]),
});

const bodySchema = z.object({
  messages: z
    .array(
      z.discriminatedUnion('role', [
        z.object({
          role: z.literal('user'),
          content: z.string().min(1).max(50_000),
        }),
        z.object({
          role: z.literal('assistant'),
          content: z.string().min(0).max(50_000),
          artifactRef: artifactRefSchema.optional(),
        }),
      ]),
    )
    .min(1)
    .max(200),
});

export function createChatRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  return new Hono<{ Variables: AuthVariables }>().post('/chat', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('validation', `Invalid body: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }

    const userId = c.get('userId');
    const userEmail = c.get('userEmail');

    const result = await runAgent({
      ctx: { userId, userEmail, supabase: deps.supabase, config: deps.config },
      systemPrompt: SYSTEM_PROMPT,
      messages: parsed.data.messages as ChatTurnInput[],
      logger: deps.logger.child({ userId, route: 'chat' }),
    });

    // Single artifact per turn. Tool calls are internal mechanism and
    // intentionally omitted from the wire — we don't want the client
    // re-deriving "what to render" from raw tool history.
    const artifact = pickArtifact(result.toolCalls);
    const artifactRef = artifact ? artifactToRef(artifact) : null;

    return c.json({
      reply: result.finalText,
      artifact,
      artifactRef,
      usage: result.usage,
    });
  });
}
