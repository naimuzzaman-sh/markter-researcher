import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { tools as toolRegistry } from '../tools/index';
import { artifactToRef, pickArtifact } from '../agent/artifact';
import { replyForArtifact } from '../agent/reply-template';

const bodySchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Deterministic tool execution endpoint. Used by pill clicks where the
 * tool name and args are already known at the click site — no LLM
 * round-trip required, no chance for the agent to skip the call.
 *
 * Shares the same artifact + ref mapping as `/chat`, so pill-produced
 * turns appear identical in the transcript and feed the same "Entities
 * in scope" memory.
 */
export function createRunToolRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  return new Hono<{ Variables: AuthVariables }>().post('/run-tool', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        'validation',
        `Invalid body: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      );
    }

    const tool = toolRegistry[parsed.data.name];
    if (!tool) {
      throw new AppError('not_found', `Unknown tool: ${parsed.data.name}`);
    }

    const userId = c.get('userId');
    const ctx = { userId, supabase: deps.supabase, config: deps.config };

    let result: unknown;
    try {
      const validatedArgs = tool.inputSchema.parse(parsed.data.args);
      result = await tool.execute(validatedArgs, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.warn(`run-tool ${parsed.data.name} failed`, { err: message });
      throw new AppError('upstream', message);
    }

    // Mimic an agent-loop tool-call record so the existing pickArtifact
    // selection rule applies uniformly across /chat and /run-tool.
    const artifact = pickArtifact([
      {
        name: parsed.data.name,
        args: parsed.data.args,
        result,
        error: null,
        durationMs: 0,
      },
    ]);
    const artifactRef = artifact ? artifactToRef(artifact) : null;
    const reply = artifact ? replyForArtifact(artifact) : '';

    return c.json({ reply, artifact, artifactRef });
  });
}
