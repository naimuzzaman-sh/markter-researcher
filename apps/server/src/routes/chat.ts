import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { runAgent, type ChatTurnInput, type ToolCallRecord } from '../agent/run-agent';
import { SYSTEM_PROMPT } from '../agent/prompts';
import { buildArtifactRef, pickArtifact } from '../agent/artifact';
import { appendStudyChat } from '../db/studies';
import type { StudyChatMessage } from '@mirrars/shared';

// Structured artifact reference echoed back on each assistant turn.
// Round-trips through the wire so subsequent /chat calls let the agent
// see "Entities in scope" without re-doing name → id resolution. Flat
// list of (kind, id, name) entities — uniform shape for list, detail,
// and mutation artifacts.
const scopeEntitySchema = z.object({
  kind: z.enum(['study', 'candidate', 'contact', 'interview', 'job']),
  id: z.string().min(1),
  name: z.string().optional(),
});

const artifactRefSchema = z.object({
  type: z.enum([
    'study.list',
    'study.detail',
    'candidate.list',
    'candidate.detail',
    'candidate.mutation',
    'contact.list',
    'contact.detail',
    'interview.list',
    'interview.detail',
    'job.status',
    // Dashboard fires on AgentChat mount and produces an artifactRef
    // carrying the recent studies / pending candidates / recent
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

type ParsedMessages = z.infer<typeof bodySchema>['messages'];

/**
 * Cap the recency window we hand to the LLM. The full chat history is
 * kept in DB and rendered in the UI, but only the tail enters the
 * prompt — input tokens scale linearly with this and the LLM doesn't
 * need turns from three days ago to continue the current edit.
 */
const MAX_HISTORY_FOR_LLM = 30;

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

    const slicedMessages = parsed.data.messages.slice(-MAX_HISTORY_FOR_LLM);

    const result = await runAgent({
      ctx: { userId, userEmail, supabase: deps.supabase, config: deps.config },
      systemPrompt: SYSTEM_PROMPT,
      messages: slicedMessages as ChatTurnInput[],
      logger: deps.logger.child({ userId, route: 'chat' }),
    });

    // Single artifact per turn. Tool calls are internal mechanism and
    // intentionally omitted from the wire — we don't want the client
    // re-deriving "what to render" from raw tool history.
    //
    // Note the asymmetry: `artifact` (the visible card) is null when
    // the agent only ran "scope-only" tools like create_study or
    // update_study, but `artifactRef` STILL gets populated with the
    // study entity so the next turn knows which study is in scope.
    // Without this, agents pick stale ids from earlier list calls
    // and update_study fails with "Study not found".
    const artifact = pickArtifact(result.toolCalls);
    const artifactRef = buildArtifactRef(artifact, result.toolCalls);

    // Persistence anchor — derived entirely server-side so the client
    // doesn't need to track studyId state. Resolution order:
    //   1. A tool call in THIS turn that touched a study (create /
    //      update / preview / get) — its result carries studyId
    //   2. The most recent prior assistant turn's artifactRef.entities
    //      contains a study — implies the user is in a chain of turns
    //      already focused on that study
    // No anchor → universal mode → ephemeral, no DB write.
    const persistStudyId = findStudyAnchor(result.toolCalls, parsed.data.messages);

    if (persistStudyId) {
      const newUserMsg = parsed.data.messages[parsed.data.messages.length - 1];
      const messagesToAppend: StudyChatMessage[] = [];
      if (newUserMsg && newUserMsg.role === 'user') {
        messagesToAppend.push({ role: 'user', content: newUserMsg.content });
      }
      messagesToAppend.push({
        role: 'assistant',
        content: result.finalText,
        ...(artifact ? { artifact } : {}),
        ...(artifactRef ? { artifactRef } : {}),
      });

      try {
        const len = await appendStudyChat(deps.supabase, persistStudyId, userId, messagesToAppend);
        deps.logger.info('chat persisted', { studyId: persistStudyId, totalMessages: len });
      } catch (err) {
        // Best-effort. A failed append shouldn't block the user from
        // getting their reply — the chat still works in-memory; only
        // the audit / resume path is degraded.
        deps.logger.warn('chat persistence failed', {
          studyId: persistStudyId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return c.json({
      reply: result.finalText,
      artifact,
      artifactRef,
      usage: result.usage,
    });
  });
}

const STUDY_ANCHOR_TOOLS = new Set([
  'create_study',
  'update_study',
  'preview_study',
  'get_study',
]);

/**
 * Server-side resolution of "which study should this turn persist into"
 * — see callsite for full prose. Returns null when neither tool calls
 * nor the message history reference a study (universal mode).
 */
function findStudyAnchor(
  calls: ToolCallRecord[],
  messages: ParsedMessages,
): string | null {
  // Walk THIS turn's tool calls — most recent first so a get_study
  // late in the loop wins over an earlier create_study (rare but
  // possible if the agent created and re-fetched in one turn).
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    if (call.error) continue;
    if (!STUDY_ANCHOR_TOOLS.has(call.name)) continue;
    const r = call.result;
    if (r && typeof r === 'object') {
      const id = (r as { studyId?: unknown }).studyId;
      if (typeof id === 'string') return id;
    }
  }
  // Walk prior assistant turns' artifactRef entities. The chat already
  // carries this for "Entities in scope" agent prompting; same data
  // tells us which study is the conversational focus.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const entities = msg.artifactRef?.entities ?? [];
    for (const entity of entities) {
      if (entity.kind === 'study') return entity.id;
    }
  }
  return null;
}
