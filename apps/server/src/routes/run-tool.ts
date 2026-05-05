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
import { appendBriefChat } from '../db/briefs';
import type { BriefChatMessage } from '@mirrars/shared';

const bodySchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  /**
   * Optional user-facing label that the click would have been as a chat
   * message. Persisted as the `user` turn so audit trails read sensibly
   * ("List candidates for Dynt" → list_candidates output) rather than
   * a bare assistant turn floating without context.
   */
  displayText: z.string().max(500).optional(),
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
    const userEmail = c.get('userEmail');
    const ctx = { userId, userEmail, supabase: deps.supabase, config: deps.config };

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

    // Persistence anchor — derived from the tool's args + result.
    // We persist ONLY for tools that meaningfully change the brief or
    // its narrative. View-only clicks (`get_brief`, `list_*`) clutter
    // chat_history with redundant "Show me brief: X" + detail-card
    // turns that, when re-hydrated on Edit, look like a loop. Mutators
    // (create / update / find_candidates / approve / reject / invite)
    // earn their place in the audit trail.
    const persistBriefId = TOOL_PERSISTS_TO_BRIEF.has(parsed.data.name)
      ? findBriefAnchor(parsed.data.args, result)
      : null;

    if (persistBriefId) {
      const messagesToAppend: BriefChatMessage[] = [];
      if (parsed.data.displayText) {
        messagesToAppend.push({ role: 'user', content: parsed.data.displayText });
      }
      messagesToAppend.push({
        role: 'assistant',
        content: reply,
        ...(artifact ? { artifact } : {}),
        ...(artifactRef ? { artifactRef } : {}),
      });
      try {
        await appendBriefChat(deps.supabase, persistBriefId, userId, messagesToAppend);
      } catch (err) {
        deps.logger.warn('run-tool persistence failed', {
          briefId: persistBriefId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return c.json({ reply, artifact, artifactRef });
  });
}

/**
 * Pill clicks that meaningfully change the brief or its working
 * narrative — these persist to chat_history. View-only clicks
 * (`get_brief`, `list_*`) are deliberately excluded: re-hydrating
 * them on Edit produces a wall of redundant "Show me brief: X" +
 * detail-card turns that look like a runaway loop.
 */
const TOOL_PERSISTS_TO_BRIEF = new Set([
  'create_brief',
  'update_brief',
  'preview_brief',
  'find_candidates',
  'approve_candidate',
  'reject_candidate',
  'invite_candidate',
]);

/**
 * Pull a briefId off either the input args (most brief-related tools
 * take it directly) or the result (create / preview return it). Falls
 * back to null when the tool doesn't reference a brief.
 */
function findBriefAnchor(args: Record<string, unknown>, result: unknown): string | null {
  const fromArgs = args.briefId;
  if (typeof fromArgs === 'string') return fromArgs;
  if (result && typeof result === 'object') {
    const fromResult = (result as { briefId?: unknown }).briefId;
    if (typeof fromResult === 'string') return fromResult;
  }
  return null;
}
