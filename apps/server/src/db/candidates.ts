import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StudyCandidate,
  CandidateStatus,
  CandidateSource,
  ContactSummary,
} from '@mirrars/shared';
import { AppError } from '../lib/errors';

type CandidateRow = {
  id: string;
  study_id: string;
  contact_id: string;
  status: string;
  source: string;
  match_score: number | string | null;
  interview_id: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  'id, study_id, contact_id, status, source, match_score, interview_id, created_at, updated_at';

function rowToCandidate(row: CandidateRow): StudyCandidate {
  return {
    id: row.id,
    studyId: row.study_id,
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
  studyId: string;
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
    .from('study_candidates')
    .insert({
      study_id: input.studyId,
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
 * Bulk-insert candidates in a single round-trip. Idempotent on the
 * `(study_id, contact_id)` uniqueness constraint — same person
 * re-discovered for the same study is silently skipped (existing
 * status / match_score is preserved). Returns the ids of the rows
 * that were ACTUALLY inserted; caller can compare length against
 * input length to count duplicates.
 *
 * Empty input → no-op (avoids a wasted call).
 *
 * Why ignore-duplicates instead of overwrite: a re-discovered
 * candidate may already be `approved`, `contacted`, or `interviewed`,
 * and clobbering their status would silently undo researcher work.
 * Match scores are also stable enough that updating them isn't worth
 * the cognitive cost.
 */
export async function insertCandidates(
  client: SupabaseClient,
  inputs: InsertInput[],
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map((input) => ({
    study_id: input.studyId,
    contact_id: input.contactId,
    source: input.source,
    match_score: input.matchScore,
    status: input.status,
  }));
  const { data, error } = await client
    .from('study_candidates')
    .upsert(rows, {
      onConflict: 'study_id,contact_id',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    throw new AppError('upstream', `Failed to insert candidates: ${error.message}`);
  }
  // PostgREST with ignoreDuplicates returns only the rows that were
  // actually inserted — duplicates are silently dropped from the
  // result set. We don't enforce length parity here; runDiscovery
  // turns the gap into its `skipped` count.
  return ((data ?? []) as Array<{ id: unknown }>)
    .map((r) => (typeof r.id === 'string' ? r.id : null))
    .filter((id): id is string => id !== null);
}

/**
 * Fetch candidate + its study's owner for server-side ownership enforcement.
 */
export async function getCandidateWithOwner(
  client: SupabaseClient,
  id: string,
): Promise<{ candidate: StudyCandidate; studyOwnerId: string } | null> {
  const { data, error } = await client
    .from('study_candidates')
    .select(`${COLS}, studies!inner(owner_id)`)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch candidate: ${error.message}`);
  if (!data) return null;

  const joined = data as CandidateRow & {
    studies: { owner_id: string } | { owner_id: string }[];
  };
  const ownerId = Array.isArray(joined.studies) ? joined.studies[0]?.owner_id : joined.studies?.owner_id;
  if (!ownerId) return null;

  return { candidate: rowToCandidate(joined), studyOwnerId: ownerId };
}

export async function listCandidatesForStudy(
  client: SupabaseClient,
  studyId: string,
  limit: number,
): Promise<StudyCandidate[]> {
  const { data, error } = await client
    .from('study_candidates')
    .select(COLS)
    .eq('study_id', studyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list candidates: ${error.message}`);
  return ((data ?? []) as CandidateRow[]).map(rowToCandidate);
}

type ContactJoinRow = {
  id: string;
  name: string;
  title: string | null;
  linkedin_url: string | null;
  company_name: string | null;
};

/**
 * Like `listCandidatesForStudy` but joins the contact summary so callers can
 * render the candidate's name/title/company without a second round-trip.
 * Sorted by match_score (desc, nulls last) then created_at desc, so the best
 * matches surface first when the agent shows the list.
 */
export async function listCandidatesForStudyWithContact(
  client: SupabaseClient,
  studyId: string,
  limit: number,
): Promise<Array<{ candidate: StudyCandidate; contact: ContactSummary }>> {
  const { data, error } = await client
    .from('study_candidates')
    .select(
      `${COLS}, contact:contacts(id, name, title, linkedin_url, company_name)`,
    )
    .eq('study_id', studyId)
    .order('match_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list candidates: ${error.message}`);

  // Supabase can type a to-one join as an array. Normalize.
  const rows = (data ?? []) as unknown as Array<
    CandidateRow & { contact: ContactJoinRow | ContactJoinRow[] | null }
  >;

  return rows
    .map((row) => {
      const c = Array.isArray(row.contact) ? row.contact[0] : row.contact;
      if (!c) return null;
      return {
        candidate: rowToCandidate(row),
        contact: {
          id: c.id,
          name: c.name,
          title: c.title,
          linkedinUrl: c.linkedin_url,
          companyName: c.company_name,
        } satisfies ContactSummary,
      };
    })
    .filter((entry): entry is { candidate: StudyCandidate; contact: ContactSummary } => entry !== null);
}

export async function updateCandidateStatus(
  client: SupabaseClient,
  id: string,
  status: CandidateStatus,
): Promise<StudyCandidate | null> {
  const { data, error } = await client
    .from('study_candidates')
    .update({ status })
    .eq('id', id)
    .select(COLS)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to update candidate status: ${error.message}`);
  if (!data) return null;
  return rowToCandidate(data as CandidateRow);
}

export async function studyBelongsToOwner(
  client: SupabaseClient,
  studyId: string,
  ownerId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('studies')
    .select('id')
    .eq('id', studyId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to check study ownership: ${error.message}`);
  return !!data;
}
