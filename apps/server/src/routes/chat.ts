import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { runAgent, type ChatTurnInput } from '../agent/run-agent';
import {
  UNIVERSAL_SYSTEM_PROMPT,
  BRIEF_SETUP_SYSTEM_PROMPT,
} from '../agent/prompts';

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(50_000),
      }),
    )
    .min(1)
    .max(200),
  mode: z.enum(['universal', 'brief-setup']).optional(),
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
    const systemPrompt =
      parsed.data.mode === 'brief-setup' ? BRIEF_SETUP_SYSTEM_PROMPT : UNIVERSAL_SYSTEM_PROMPT;

    const result = await runAgent({
      ctx: { userId, supabase: deps.supabase, config: deps.config },
      systemPrompt,
      messages: parsed.data.messages as ChatTurnInput[],
      logger: deps.logger.child({ userId, route: 'chat' }),
    });

    return c.json({
      reply: result.finalText,
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        result: tc.result,
        error: tc.error,
        durationMs: tc.durationMs,
      })),
      usage: result.usage,
    });
  });
}
