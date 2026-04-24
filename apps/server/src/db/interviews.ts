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
): Promise<InterviewSummary[]> {
  let query = client
    .from('interviews')
    .select(
      'id, brief_id, status, duration_secs, analysis, completed_at, briefs!inner(owner_id)',
    )
    .eq('briefs.owner_id', ownerId);

  if (briefId) query = query.eq('brief_id', briefId);

  const { data, error } = await query
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list interviews: ${error.message}`);

  return ((data ?? []) as InterviewListRow[]).map((row) => ({
    interviewId: row.id,
    briefId: row.brief_id,
    status: row.status,
    durationSecs: row.duration_secs,
    overallSentiment: row.analysis?.overallSentiment ?? null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
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
): Promise<void> {
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
  const { error } = await client.from('interviews').insert(row);
  if (error) throw new AppError('upstream', `Failed to save interview: ${error.message}`);
}
