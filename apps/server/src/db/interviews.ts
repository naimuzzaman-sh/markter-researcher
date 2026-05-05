import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SavedInterview,
  InterviewSummary,
  InterviewDetail,
} from '@mirrars/shared';
import { AppError } from '../lib/errors';

type InterviewListRow = {
  id: string;
  study_id: string | null;
  status: 'completed' | 'failed';
  duration_secs: number | null;
  analysis: { overallSentiment?: 'positive' | 'neutral' | 'negative' } | null;
  completed_at: string | null;
  studies: {
    research_context: { product?: { name?: string } } | null;
  } | null;
  study_candidate:
    | { contact: { name: string } | { name: string }[] | null }
    | { contact: { name: string } | { name: string }[] | null }[]
    | null;
};

export type InterviewSummaryWithNames = InterviewSummary & {
  studyName: string | null;
  contactName: string | null;
};

type InterviewDetailRow = {
  id: string;
  study_id: string | null;
  status: 'completed' | 'failed';
  transcript: SavedInterview['transcript'];
  analysis: SavedInterview['analysis'];
  duration_secs: number | null;
  completed_at: string | null;
};

/**
 * List interviews owned by a user. Ownership is enforced via an inner join
 * on `studies.owner_id`, so rows belonging to other users are filtered at the
 * DB layer rather than in app code.
 */
export async function listInterviewsByOwner(
  client: SupabaseClient,
  ownerId: string,
  studyId: string | undefined,
  limit: number,
): Promise<InterviewSummaryWithNames[]> {
  let query = client
    .from('interviews')
    .select(
      `id, study_id, status, duration_secs, analysis, completed_at,
       studies!inner(owner_id, research_context),
       study_candidate:study_candidates!interview_id(contact:contacts(name))`,
    )
    .eq('studies.owner_id', ownerId);

  if (studyId) query = query.eq('study_id', studyId);

  const { data, error } = await query
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list interviews: ${error.message}`);

  // Supabase types embedded relations as object | array. Normalize to scalars.
  const rows = (data ?? []) as unknown as InterviewListRow[];

  return rows.map((row) => {
    const study = Array.isArray(row.studies) ? row.studies[0] : row.studies;
    const studyName = study?.research_context?.product?.name ?? null;

    const candidate = Array.isArray(row.study_candidate)
      ? row.study_candidate[0]
      : row.study_candidate;
    const candidateContact = candidate
      ? Array.isArray(candidate.contact)
        ? candidate.contact[0]
        : candidate.contact
      : null;
    const contactName = candidateContact?.name ?? null;

    return {
      interviewId: row.id,
      studyId: row.study_id,
      studyName,
      contactName,
      status: row.status,
      durationSecs: row.duration_secs,
      overallSentiment: row.analysis?.overallSentiment ?? null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  });
}

/**
 * Load all COMPLETED interviews for a study, with full transcripts +
 * analyses. Used by the post-interview summarizer to synthesize
 * study-level findings. No owner-gate here — this is server-internal,
 * called from server-side handlers that already have the study in
 * scope (fire-and-forget after `endCall`).
 *
 * Failed interviews are excluded — empty transcripts contribute
 * nothing to a synthesis.
 */
export async function listCompletedInterviewsForStudySummarization(
  client: SupabaseClient,
  studyId: string,
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
    .eq('study_id', studyId)
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
      'id, study_id, status, transcript, analysis, duration_secs, completed_at, studies!inner(owner_id)',
    )
    .eq('id', interviewId)
    .eq('studies.owner_id', ownerId)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch interview: ${error.message}`);
  if (!data) return null;

  const row = data as InterviewDetailRow;
  return {
    interviewId: row.id,
    studyId: row.study_id,
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
    study_id: interview.studyId,
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
