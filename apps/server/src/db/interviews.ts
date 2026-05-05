import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SavedInterview,
  InterviewSummary,
  InterviewDetail,
} from '@mirrars/shared';
import { AppError } from '../lib/errors';

type InterviewListRow = {
  id: string;
  brief_id: string | null;
  status: 'completed' | 'failed';
  duration_secs: number | null;
  analysis: { overallSentiment?: 'positive' | 'neutral' | 'negative' } | null;
  completed_at: string | null;
  briefs: {
    research_context: { product?: { name?: string } } | null;
  } | null;
  brief_candidate:
    | { contact: { name: string } | { name: string }[] | null }
    | { contact: { name: string } | { name: string }[] | null }[]
    | null;
};

export type InterviewSummaryWithNames = InterviewSummary & {
  briefName: string | null;
  contactName: string | null;
};

type InterviewDetailRow = {
  id: string;
  brief_id: string | null;
  status: 'completed' | 'failed';
  transcript: SavedInterview['transcript'];
  analysis: SavedInterview['analysis'];
  duration_secs: number | null;
  completed_at: string | null;
};

/**
 * List interviews owned by a user. Ownership is enforced via an inner join
 * on `briefs.owner_id`, so rows belonging to other users are filtered at the
 * DB layer rather than in app code.
 */
export async function listInterviewsByOwner(
  client: SupabaseClient,
  ownerId: string,
  briefId: string | undefined,
  limit: number,
): Promise<InterviewSummaryWithNames[]> {
  let query = client
    .from('interviews')
    .select(
      `id, brief_id, status, duration_secs, analysis, completed_at,
       briefs!inner(owner_id, research_context),
       brief_candidate:brief_candidates!interview_id(contact:contacts(name))`,
    )
    .eq('briefs.owner_id', ownerId);

  if (briefId) query = query.eq('brief_id', briefId);

  const { data, error } = await query
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list interviews: ${error.message}`);

  // Supabase types embedded relations as object | array. Normalize to scalars.
  const rows = (data ?? []) as unknown as InterviewListRow[];

  return rows.map((row) => {
    const brief = Array.isArray(row.briefs) ? row.briefs[0] : row.briefs;
    const briefName = brief?.research_context?.product?.name ?? null;

    const candidate = Array.isArray(row.brief_candidate)
      ? row.brief_candidate[0]
      : row.brief_candidate;
    const candidateContact = candidate
      ? Array.isArray(candidate.contact)
        ? candidate.contact[0]
        : candidate.contact
      : null;
    const contactName = candidateContact?.name ?? null;

    return {
      interviewId: row.id,
      briefId: row.brief_id,
      briefName,
      contactName,
      status: row.status,
      durationSecs: row.duration_secs,
      overallSentiment: row.analysis?.overallSentiment ?? null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  });
}

/**
 * Load all COMPLETED interviews for a brief, with full transcripts +
 * analyses. Used by the post-interview summarizer to synthesize
 * brief-level findings. No owner-gate here — this is server-internal,
 * called from server-side handlers that already have the brief in
 * scope (fire-and-forget after `endCall`).
 *
 * Failed interviews are excluded — empty transcripts contribute
 * nothing to a synthesis.
 */
export async function listCompletedInterviewsForBriefSummarization(
  client: SupabaseClient,
  briefId: string,
): Promise<
  Array<{
    interviewId: string;
    transcript: SavedInterview['transcript'];
    analysis: SavedInterview['analysis'];
    completedAt: Date | null;
  }>
> {
  const { data, error } = await client
    .from('interviews')
    .select('id, transcript, analysis, completed_at')
    .eq('brief_id', briefId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: true });
  if (error) {
    throw new AppError('upstream', `Failed to load interviews for summary: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    id: string;
    transcript: SavedInterview['transcript'];
    analysis: SavedInterview['analysis'];
    completed_at: string | null;
  }>).map((r) => ({
    interviewId: r.id,
    transcript: r.transcript,
    analysis: r.analysis,
    completedAt: r.completed_at ? new Date(r.completed_at) : null,
  }));
}

/**
 * Fetch one interview the caller owns. Missing-or-unauthorized collapses to
 * null so we never reveal which owner the interview belongs to.
 */
export async function getInterviewById(
  client: SupabaseClient,
  interviewId: string,
  ownerId: string,
): Promise<InterviewDetail | null> {
  const { data, error } = await client
    .from('interviews')
    .select(
      'id, brief_id, status, transcript, analysis, duration_secs, completed_at, briefs!inner(owner_id)',
    )
    .eq('id', interviewId)
    .eq('briefs.owner_id', ownerId)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch interview: ${error.message}`);
  if (!data) return null;

  const row = data as InterviewDetailRow;
  return {
    interviewId: row.id,
    briefId: row.brief_id,
    status: row.status,
    transcript: row.transcript,
    analysis: row.analysis,
    durationSecs: row.duration_secs,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export async function saveInterview(
  client: SupabaseClient,
  interview: SavedInterview,
): Promise<string> {
  const row = {
    call_id: interview.callId,
    agent_id: interview.agentId,
    brief_id: interview.briefId,
    conversation_id: interview.conversationId,
    status: interview.status,
    research_context: interview.researchContext,
    transcript: interview.transcript,
    analysis: interview.analysis,
    duration_secs: interview.durationSecs,
    completed_at: interview.completedAt ? interview.completedAt.toISOString() : null,
  };
  const { data, error } = await client
    .from('interviews')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new AppError('upstream', `Failed to save interview: ${error.message}`);
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new AppError('internal', 'Interview insert returned no id');
  }
  return (data as { id: string }).id;
}
