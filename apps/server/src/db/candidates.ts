import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BriefCandidate,
  CandidateStatus,
  CandidateSource,
} from '@market-researcher/shared';
import { AppError } from '../lib/errors';

type CandidateRow = {
  id: string;
  brief_id: string;
  contact_id: string;
  status: string;
  source: string;
  match_score: number | string | null;
  interview_id: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  'id, brief_id, contact_id, status, source, match_score, interview_id, created_at, updated_at';

function rowToCandidate(row: CandidateRow): BriefCandidate {
  return {
    id: row.id,
    briefId: row.brief_id,
    contactId: row.contact_id,
    status: row.status as CandidateStatus,
    source: row.source as CandidateSource,
    matchScore: row.match_score === null ? null : Number(row.match_score),
    interviewId: row.interview_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

type InsertInput = {
  briefId: string;
  contactId: string;
  source: CandidateSource;
  matchScore: number | null;
  status: CandidateStatus;
};

export async function insertCandidate(
  client: SupabaseClient,
  input: InsertInput,
): Promise<string> {
  const { data, error } = await client
    .from('brief_candidates')
    .insert({
      brief_id: input.briefId,
      contact_id: input.contactId,
      source: input.source,
      match_score: input.matchScore,
      status: input.status,
    })
    .select('id')
    .single();

  if (error) throw new AppError('upstream', `Failed to insert candidate: ${error.message}`);
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new AppError('internal', 'Candidate insert returned no id');
  }
  return (data as { id: string }).id;
}

/**
 * Fetch candidate + its brief's owner for server-side ownership enforcement.
 */
export async function getCandidateWithOwner(
  client: SupabaseClient,
  id: string,
): Promise<{ candidate: BriefCandidate; briefOwnerId: string } | null> {
  const { data, error } = await client
    .from('brief_candidates')
    .select(`${COLS}, briefs!inner(owner_id)`)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch candidate: ${error.message}`);
  if (!data) return null;

  const joined = data as CandidateRow & {
    briefs: { owner_id: string } | { owner_id: string }[];
  };
  const ownerId = Array.isArray(joined.briefs) ? joined.briefs[0]?.owner_id : joined.briefs?.owner_id;
  if (!ownerId) return null;

  return { candidate: rowToCandidate(joined), briefOwnerId: ownerId };
}

export async function listCandidatesForBrief(
  client: SupabaseClient,
  briefId: string,
  limit: number,
): Promise<BriefCandidate[]> {
  const { data, error } = await client
    .from('brief_candidates')
    .select(COLS)
    .eq('brief_id', briefId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list candidates: ${error.message}`);
  return ((data ?? []) as CandidateRow[]).map(rowToCandidate);
}

export async function updateCandidateStatus(
  client: SupabaseClient,
  id: string,
  status: CandidateStatus,
): Promise<BriefCandidate | null> {
  const { data, error } = await client
    .from('brief_candidates')
    .update({ status })
    .eq('id', id)
    .select(COLS)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to update candidate status: ${error.message}`);
  if (!data) return null;
  return rowToCandidate(data as CandidateRow);
}

export async function briefBelongsToOwner(
  client: SupabaseClient,
  briefId: string,
  ownerId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('briefs')
    .select('id')
    .eq('id', briefId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to check brief ownership: ${error.message}`);
  return !!data;
}
