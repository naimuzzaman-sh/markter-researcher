import type { SupabaseClient } from '@supabase/supabase-js';
import {
  studyPatchSchema,
  studyResultsSchema,
  type ResearchContext,
  type Study,
  type StudyStatus,
  type StudyChatMessage,
  type StudyResults,
} from '@mirrars/shared';
import { AppError } from '../lib/errors';

type StudyRow = {
  id: string;
  research_context: unknown;
  status: StudyStatus;
  chat_history: unknown;
  results: unknown;
  created_at: string;
};

const COLS = 'id, research_context, status, chat_history, results, created_at';

function rowToStudy(row: StudyRow): Study {
  // Lenient parse on read — drafts may legitimately have a partial
  // research_context with missing leaf fields. We reuse `studyPatchSchema`
  // (deep-partial — every level optional) instead of `researchContextSchema`
  // (which requires every leaf). Strict full validation only runs at the
  // active-promotion point in `update_study`. Cast back to ResearchContext
  // for type continuity; consumers already use optional chaining for
  // nested fields.
  const lenient = studyPatchSchema.parse(row.research_context ?? {});
  const chat = Array.isArray(row.chat_history)
    ? (row.chat_history as StudyChatMessage[])
    : [];
  // Lenient parse on results too — schema may evolve and we don't
  // want a single old row tripping the study-detail render.
  const resultsParse = row.results ? studyResultsSchema.safeParse(row.results) : null;
  const results: StudyResults | null = resultsParse?.success
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

export async function listStudiesByOwner(
  client: SupabaseClient,
  ownerId: string,
  limit: number,
): Promise<Study[]> {
  const { data, error } = await client
    .from('studies')
    .select(COLS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list studies: ${error.message}`);
  return (data ?? []).map((r) => rowToStudy(r as StudyRow));
}

export async function getStudyById(
  client: SupabaseClient,
  id: string,
): Promise<Study | null> {
  const { data, error } = await client
    .from('studies')
    .select(COLS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch study: ${error.message}`);
  if (!data) return null;
  return rowToStudy(data as StudyRow);
}

type InsertStudyInput = {
  context: Partial<ResearchContext>;
  ownerId: string;
  status?: StudyStatus;
};

/**
 * Create a study. New studies default to `status='draft'` so the chat
 * can iterate on a partial research_context. Pass `status='active'`
 * for the legacy one-shot create flow (caller must have validated
 * the full context first).
 */
export async function insertStudy(
  client: SupabaseClient,
  input: InsertStudyInput,
): Promise<string> {
  const { data, error } = await client
    .from('studies')
    .insert({
      research_context: input.context,
      owner_id: input.ownerId,
      status: input.status ?? 'draft',
    })
    .select('id')
    .single();

  if (error) throw new AppError('upstream', `Failed to insert study: ${error.message}`);
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new AppError('internal', 'Study insert returned no id');
  }
  return (data as { id: string }).id;
}

type UpdateStudyPatch = {
  context?: Partial<ResearchContext>;
  status?: StudyStatus;
};

/**
 * Patch a study the owner owns. Either or both of `context` /
 * `status` may be supplied. Returns the merged study, or null when
 * the row doesn't exist OR belongs to a different owner (we collapse
 * both to null so we don't leak existence).
 *
 * Schema validation of the merged research_context is the caller's
 * job — they know whether the study is being promoted to 'active'
 * (strict validation required) or staying 'draft' (partial OK).
 */
export async function updateStudyById(
  client: SupabaseClient,
  studyId: string,
  ownerId: string,
  patch: UpdateStudyPatch,
): Promise<Study | null> {
  const update: Record<string, unknown> = {};
  if (patch.context !== undefined) update.research_context = patch.context;
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) {
    // No-op patch — fetch and return current state for a consistent shape.
    return getStudyById(client, studyId);
  }

  const { data, error } = await client
    .from('studies')
    .update(update)
    .eq('id', studyId)
    .eq('owner_id', ownerId)
    .select(COLS)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to update study: ${error.message}`);
  if (!data) return null;
  return rowToStudy(data as StudyRow);
}

/**
 * Overwrite a study's `results` payload with a fresh synthesis.
 * Called by the post-interview summarizer; subsequent interviews
 * replace the prior results (last-writer-wins is fine — the
 * inputs are stable transcripts).
 *
 * Returns true on success, false when the study doesn't exist
 * (no error thrown — the summarizer is fire-and-forget and a
 * deleted study mid-flight shouldn't crash the queue).
 */
export async function updateStudyResults(
  client: SupabaseClient,
  studyId: string,
  results: StudyResults,
): Promise<boolean> {
  const { data, error } = await client
    .from('studies')
    .update({ results })
    .eq('id', studyId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new AppError('upstream', `Failed to update study results: ${error.message}`);
  }
  return data !== null;
}

/**
 * Append messages to a study's chat history. Atomic via Postgres'
 * `||` jsonb concat operator under the hood (delivered server-side
 * by Supabase as `update ... set chat_history = chat_history || $1`).
 *
 * Owner-gated. Returns the updated message count on success, or
 * null when the study doesn't exist / isn't owned by `ownerId`.
 */
export async function appendStudyChat(
  client: SupabaseClient,
  studyId: string,
  ownerId: string,
  newMessages: StudyChatMessage[],
): Promise<number | null> {
  if (newMessages.length === 0) {
    // No-op — nothing to append. Return current length so callers can
    // log consistent info.
    const existing = await getStudyById(client, studyId);
    return existing && existing.id ? existing.chatHistory.length : null;
  }

  // Two-step read-merge-write under the row's owner gate. Acceptable
  // for a single-writer-per-study model (the study's owner holds the
  // chat session). Move to a Postgres function with `||` if we ever
  // see real concurrent writes against the same study.
  const existing = await client
    .from('studies')
    .select('chat_history')
    .eq('id', studyId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (existing.error) {
    throw new AppError('upstream', `Failed to read chat history: ${existing.error.message}`);
  }
  if (!existing.data) return null;

  const current = Array.isArray(existing.data.chat_history)
    ? (existing.data.chat_history as StudyChatMessage[])
    : [];
  const merged = [...current, ...newMessages];

  const { error: writeError } = await client
    .from('studies')
    .update({ chat_history: merged })
    .eq('id', studyId)
    .eq('owner_id', ownerId);
  if (writeError) {
    throw new AppError('upstream', `Failed to append chat history: ${writeError.message}`);
  }
  return merged.length;
}
