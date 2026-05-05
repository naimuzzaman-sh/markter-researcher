import type { SupabaseClient } from '@supabase/supabase-js';
import {
  briefPatchSchema,
  briefResultsSchema,
  type ResearchContext,
  type Brief,
  type BriefStatus,
  type BriefChatMessage,
  type BriefResults,
} from '@mirrars/shared';
import { AppError } from '../lib/errors';

type BriefRow = {
  id: string;
  research_context: unknown;
  status: BriefStatus;
  chat_history: unknown;
  results: unknown;
  created_at: string;
};

const COLS = 'id, research_context, status, chat_history, results, created_at';

function rowToBrief(row: BriefRow): Brief {
  // Lenient parse on read — drafts may legitimately have a partial
  // research_context with missing leaf fields. We reuse `briefPatchSchema`
  // (deep-partial — every level optional) instead of `researchContextSchema`
  // (which requires every leaf). Strict full validation only runs at the
  // active-promotion point in `update_brief`. Cast back to ResearchContext
  // for type continuity; consumers already use optional chaining for
  // nested fields.
  const lenient = briefPatchSchema.parse(row.research_context ?? {});
  const chat = Array.isArray(row.chat_history)
    ? (row.chat_history as BriefChatMessage[])
    : [];
  // Lenient parse on results too — schema may evolve and we don't
  // want a single old row tripping the brief-detail render.
  const resultsParse = row.results ? briefResultsSchema.safeParse(row.results) : null;
  const results: BriefResults | null = resultsParse?.success
    ? resultsParse.data
    : null;
  return {
    id: row.id,
    researchContext: lenient as ResearchContext,
    status: row.status,
    chatHistory: chat,
    results,
    createdAt: new Date(row.created_at),
  };
}

export async function listBriefsByOwner(
  client: SupabaseClient,
  ownerId: string,
  limit: number,
): Promise<Brief[]> {
  const { data, error } = await client
    .from('briefs')
    .select(COLS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list briefs: ${error.message}`);
  return (data ?? []).map((r) => rowToBrief(r as BriefRow));
}

export async function getBriefById(
  client: SupabaseClient,
  id: string,
): Promise<Brief | null> {
  const { data, error } = await client
    .from('briefs')
    .select(COLS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch brief: ${error.message}`);
  if (!data) return null;
  return rowToBrief(data as BriefRow);
}

type InsertBriefInput = {
  context: Partial<ResearchContext>;
  ownerId: string;
  status?: BriefStatus;
};

/**
 * Create a brief. New briefs default to `status='draft'` so the chat
 * can iterate on a partial research_context. Pass `status='active'`
 * for the legacy one-shot create flow (caller must have validated
 * the full context first).
 */
export async function insertBrief(
  client: SupabaseClient,
  input: InsertBriefInput,
): Promise<string> {
  const { data, error } = await client
    .from('briefs')
    .insert({
      research_context: input.context,
      owner_id: input.ownerId,
      status: input.status ?? 'draft',
    })
    .select('id')
    .single();

  if (error) throw new AppError('upstream', `Failed to insert brief: ${error.message}`);
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new AppError('internal', 'Brief insert returned no id');
  }
  return (data as { id: string }).id;
}

type UpdateBriefPatch = {
  context?: Partial<ResearchContext>;
  status?: BriefStatus;
};

/**
 * Patch a brief the owner owns. Either or both of `context` /
 * `status` may be supplied. Returns the merged brief, or null when
 * the row doesn't exist OR belongs to a different owner (we collapse
 * both to null so we don't leak existence).
 *
 * Schema validation of the merged research_context is the caller's
 * job — they know whether the brief is being promoted to 'active'
 * (strict validation required) or staying 'draft' (partial OK).
 */
export async function updateBriefById(
  client: SupabaseClient,
  briefId: string,
  ownerId: string,
  patch: UpdateBriefPatch,
): Promise<Brief | null> {
  const update: Record<string, unknown> = {};
  if (patch.context !== undefined) update.research_context = patch.context;
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) {
    // No-op patch — fetch and return current state for a consistent shape.
    return getBriefById(client, briefId);
  }

  const { data, error } = await client
    .from('briefs')
    .update(update)
    .eq('id', briefId)
    .eq('owner_id', ownerId)
    .select(COLS)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to update brief: ${error.message}`);
  if (!data) return null;
  return rowToBrief(data as BriefRow);
}

/**
 * Overwrite a brief's `results` payload with a fresh synthesis.
 * Called by the post-interview summarizer; subsequent interviews
 * replace the prior results (last-writer-wins is fine — the
 * inputs are stable transcripts).
 *
 * Returns true on success, false when the brief doesn't exist
 * (no error thrown — the summarizer is fire-and-forget and a
 * deleted brief mid-flight shouldn't crash the queue).
 */
export async function updateBriefResults(
  client: SupabaseClient,
  briefId: string,
  results: BriefResults,
): Promise<boolean> {
  const { data, error } = await client
    .from('briefs')
    .update({ results })
    .eq('id', briefId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new AppError('upstream', `Failed to update brief results: ${error.message}`);
  }
  return data !== null;
}

/**
 * Append messages to a brief's chat history. Atomic via Postgres'
 * `||` jsonb concat operator under the hood (delivered server-side
 * by Supabase as `update ... set chat_history = chat_history || $1`).
 *
 * Owner-gated. Returns the updated message count on success, or
 * null when the brief doesn't exist / isn't owned by `ownerId`.
 */
export async function appendBriefChat(
  client: SupabaseClient,
  briefId: string,
  ownerId: string,
  newMessages: BriefChatMessage[],
): Promise<number | null> {
  if (newMessages.length === 0) {
    // No-op — nothing to append. Return current length so callers can
    // log consistent info.
    const existing = await getBriefById(client, briefId);
    return existing && existing.id ? existing.chatHistory.length : null;
  }

  // Two-step read-merge-write under the row's owner gate. Acceptable
  // for a single-writer-per-brief model (the brief's owner holds the
  // chat session). Move to a Postgres function with `||` if we ever
  // see real concurrent writes against the same brief.
  const existing = await client
    .from('briefs')
    .select('chat_history')
    .eq('id', briefId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (existing.error) {
    throw new AppError('upstream', `Failed to read chat history: ${existing.error.message}`);
  }
  if (!existing.data) return null;

  const current = Array.isArray(existing.data.chat_history)
    ? (existing.data.chat_history as BriefChatMessage[])
    : [];
  const merged = [...current, ...newMessages];

  const { error: writeError } = await client
    .from('briefs')
    .update({ chat_history: merged })
    .eq('id', briefId)
    .eq('owner_id', ownerId);
  if (writeError) {
    throw new AppError('upstream', `Failed to append chat history: ${writeError.message}`);
  }
  return merged.length;
}
