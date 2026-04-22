import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  SavedInterview,
  InterviewSummary,
  InterviewDetail,
} from './types/saved-interview.type';
import type { Brief } from './types/brief.type';
import {
  researchContextSchema,
  type ResearchContext,
} from './types/research-context.type';
import type {
  AgentJob,
  AgentJobKind,
  AgentJobStatus,
} from './types/agent-job.type';
import type { Contact } from './types/contact.type';
import type {
  BriefCandidate,
  CandidateSource,
  CandidateStatus,
} from './types/candidate.type';
import { defaultLogger, type SharedLogger } from './logger';

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

type BriefRow = {
  id: string;
  research_context: unknown;
  created_at: string;
};

type AgentJobRow = {
  id: string;
  owner_id: string;
  kind: string;
  status: string;
  input_json: unknown;
  output_json: unknown | null;
  error: string | null;
  cost_usd: number | string | null;
  tokens_used: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

function rowToAgentJob(row: AgentJobRow): AgentJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind as AgentJobKind,
    status: row.status as AgentJobStatus,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    tokensUsed: row.tokens_used,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    createdAt: new Date(row.created_at),
  };
}

const AGENT_JOB_COLS =
  'id, owner_id, kind, status, input_json, output_json, error, cost_usd, tokens_used, started_at, finished_at, created_at';

type ContactRow = {
  id: string;
  owner_id: string;
  name: string;
  linkedin_url: string | null;
  title: string | null;
  company_name: string | null;
  company_domain: string | null;
  email: string | null;
  location: string | null;
  profile_json: unknown | null;
  research_notes: string | null;
  // pgvector columns come back from Supabase as a string literal like
  // "[0.1, 0.2, ...]" — not a JS array. We parse in `rowToContact`.
  embedding: string | number[] | null;
  created_at: string;
  updated_at: string;
};

/**
 * Convert a JS number[] to pgvector's accepted string literal
 * (`"[0.1,0.2,...]"`). Supabase PostgREST does NOT auto-serialize JS arrays
 * to vector; sending the raw array produces "invalid input syntax for type
 * vector" errors at insert time.
 */
function formatVectorForInsert(embedding: number[] | null): string | null {
  if (embedding === null) return null;
  return `[${embedding.join(',')}]`;
}

/** Inverse of formatVectorForInsert — parses `"[0.1,0.2,...]"` back to number[]. */
function parseVectorFromRow(raw: string | number[] | null): number[] | null {
  if (raw === null) return null;
  if (Array.isArray(raw)) return raw;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    linkedinUrl: row.linkedin_url,
    title: row.title,
    companyName: row.company_name,
    companyDomain: row.company_domain,
    email: row.email,
    location: row.location,
    profileJson: row.profile_json,
    researchNotes: row.research_notes,
    embedding: parseVectorFromRow(row.embedding),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const CONTACT_COLS =
  'id, owner_id, name, linkedin_url, title, company_name, company_domain, email, location, profile_json, research_notes, embedding, created_at, updated_at';

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

const CANDIDATE_COLS =
  'id, brief_id, contact_id, status, source, match_score, interview_id, created_at, updated_at';

/** Minimal user shape we care about from Supabase Auth. */
export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

/**
 * All `briefs` / `interviews` / auth queries live here. Plain class (no
 * decorators) so both the NestJS backend and the MCP can consume it:
 *  - `apps/api` wraps it in a thin `@Injectable()` subclass.
 *  - `apps/mcp` constructs it directly with a SupabaseClient that carries
 *    the signed-in user's JWT as the Authorization header.
 */
export class SupabaseService {
  private readonly client: SupabaseClient;
  private readonly logger: SharedLogger;

  /**
   * Two construction shapes:
   *  - `new SupabaseService(url, anonKey, logger?)` — constructs the client.
   *    This is how `apps/api` uses it (anon key, no per-user JWT).
   *  - `new SupabaseService(client, logger?)` — reuses an existing client.
   *    This is how `apps/mcp` uses it (the client was built with the user's
   *    JWT as `Authorization: Bearer <jwt>` so every query is owner-scoped).
   */
  constructor(url: string, anonKey: string, logger?: SharedLogger);
  constructor(client: SupabaseClient, logger?: SharedLogger);
  constructor(
    urlOrClient: string | SupabaseClient,
    anonKeyOrLogger?: string | SharedLogger,
    maybeLogger?: SharedLogger,
  ) {
    if (typeof urlOrClient === 'string') {
      const url = urlOrClient;
      const anonKey = anonKeyOrLogger as string;
      this.client = createClient(url, anonKey);
      this.logger = maybeLogger ?? defaultLogger;
    } else {
      this.client = urlOrClient;
      this.logger = (anonKeyOrLogger as SharedLogger | undefined) ?? defaultLogger;
    }
  }

  /**
   * Verify a Supabase-issued JWT by asking Supabase to decode it.
   * Returns the authenticated user, or null if the token is missing/invalid/expired.
   * We explicitly swallow network errors and return null so callers can throw a
   * clean 401 regardless of upstream failure mode.
   */
  /**
   * Exchange a Supabase refresh token for a fresh access/refresh pair.
   * Returns null on any failure (expired, revoked, network) so callers
   * can surface a clean "please re-authorize" error without leaking
   * Supabase-specific detail.
   */
  async refreshSession(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    userId: string;
  } | null> {
    try {
      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data?.session) {
        return null;
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt:
          data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        userId: data.session.user.id,
      };
    } catch (err) {
      this.logger.warn(
        `refreshSession threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async getUserFromJwt(jwt: string): Promise<AuthUser | null> {
    try {
      const { data, error } = await this.client.auth.getUser(jwt);
      if (error || !data?.user) {
        return null;
      }
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        phone: data.user.phone ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `getUserFromJwt threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async saveInterview(interview: SavedInterview): Promise<void> {
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
      completed_at: interview.completedAt
        ? interview.completedAt.toISOString()
        : null,
    };

    const { error } = await this.client.from('interviews').insert(row);

    if (error) {
      throw new Error(`Failed to save interview: ${error.message}`);
    }
  }

  async insertBrief(
    researchContext: ResearchContext,
    ownerId: string,
  ): Promise<string> {
    const { data, error } = await this.client
      .from('briefs')
      .insert({ research_context: researchContext, owner_id: ownerId })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create brief: ${error.message}`);
    }
    if (!data || typeof data.id !== 'string') {
      throw new Error('Brief insert returned no id');
    }
    return data.id;
  }

  async getBriefById(id: string): Promise<Brief | null> {
    const { data, error } = await this.client
      .from('briefs')
      .select('id, research_context, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch brief: ${error.message}`);
    }
    if (!data) return null;

    const row = data as BriefRow;
    const context = researchContextSchema.parse(row.research_context);
    return {
      id: row.id,
      researchContext: context,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * List briefs owned by a single user, newest-first.
   * Application-level ownership scoping: we filter `owner_id = ownerId` in the
   * query. Supabase RLS is disabled in current phases, so this is the guardrail.
   */
  async listBriefsByOwner(ownerId: string, limit: number): Promise<Brief[]> {
    const { data, error } = await this.client
      .from('briefs')
      .select('id, research_context, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list briefs: ${error.message}`);
    }

    const rows = (data ?? []) as BriefRow[];
    return rows.map((row) => ({
      id: row.id,
      researchContext: researchContextSchema.parse(row.research_context),
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * List interviews owned by a single user, newest-first (by completed_at).
   * Owner scoping is enforced via an inner join on `briefs` so the server-side
   * filter eliminates non-owned rows before they hit the client.
   * Optional `briefId` narrows results to a single brief.
   */
  async listInterviews(
    ownerId: string,
    briefId: string | undefined,
    limit: number,
  ): Promise<InterviewSummary[]> {
    let query = this.client
      .from('interviews')
      .select(
        'id, brief_id, status, duration_secs, analysis, completed_at, briefs!inner(owner_id)',
      )
      .eq('briefs.owner_id', ownerId);

    if (briefId) {
      query = query.eq('brief_id', briefId);
    }

    const { data, error } = await query
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list interviews: ${error.message}`);
    }

    const rows = (data ?? []) as InterviewListRow[];
    return rows.map((row) => ({
      interviewId: row.id,
      briefId: row.brief_id,
      status: row.status,
      durationSecs: row.duration_secs,
      overallSentiment: row.analysis?.overallSentiment ?? null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    }));
  }

  /**
   * Fetch full interview detail for a single interview the caller owns.
   * Ownership is enforced via the `briefs!inner(owner_id)` join filter, so
   * both "not found" and "not owned" collapse to `null` — we don't leak the
   * existence of interviews owned by other users.
   */
  async getInterviewById(
    interviewId: string,
    ownerId: string,
  ): Promise<InterviewDetail | null> {
    const { data, error } = await this.client
      .from('interviews')
      .select(
        'id, brief_id, status, transcript, analysis, duration_secs, completed_at, briefs!inner(owner_id)',
      )
      .eq('id', interviewId)
      .eq('briefs.owner_id', ownerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch interview: ${error.message}`);
    }
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

  // ---------------------------------------------------------------------------
  // Agent jobs (generic async work queue — discovery/research/outreach)
  // ---------------------------------------------------------------------------

  async insertAgentJob(input: {
    ownerId: string;
    kind: AgentJobKind;
    inputJson: unknown;
  }): Promise<string> {
    const { data, error } = await this.client
      .from('agent_jobs')
      .insert({
        owner_id: input.ownerId,
        kind: input.kind,
        status: 'queued',
        input_json: input.inputJson,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to enqueue agent job: ${error.message}`);
    }
    if (!data || typeof data.id !== 'string') {
      throw new Error('Agent job insert returned no id');
    }
    return data.id;
  }

  async getAgentJobById(id: string): Promise<AgentJob | null> {
    const { data, error } = await this.client
      .from('agent_jobs')
      .select(AGENT_JOB_COLS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch agent job: ${error.message}`);
    }
    if (!data) return null;
    return rowToAgentJob(data as AgentJobRow);
  }

  async listAgentJobsByOwner(
    ownerId: string,
    limit: number,
  ): Promise<AgentJob[]> {
    const { data, error } = await this.client
      .from('agent_jobs')
      .select(AGENT_JOB_COLS)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list agent jobs: ${error.message}`);
    }
    const rows = (data ?? []) as AgentJobRow[];
    return rows.map(rowToAgentJob);
  }

  /**
   * Atomically claim the oldest queued job by flipping its status to
   * `running`. Uses an optimistic `status = 'queued'` guard on UPDATE so
   * concurrent workers can't double-claim: only one update will match.
   * Returns null when no queued work is available.
   */
  async claimNextQueuedJob(): Promise<AgentJob | null> {
    // 1) Find the oldest queued job (no lock — just a candidate).
    const { data: candidate, error: selErr } = await this.client
      .from('agent_jobs')
      .select('id')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (selErr) {
      throw new Error(`Failed to poll agent jobs: ${selErr.message}`);
    }
    if (!candidate) return null;

    // 2) Transition queued → running. If another worker won the race, this
    //    update affects 0 rows and we return null (next tick will retry).
    const { data: updated, error: updErr } = await this.client
      .from('agent_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select(AGENT_JOB_COLS)
      .maybeSingle();

    if (updErr) {
      throw new Error(`Failed to claim agent job: ${updErr.message}`);
    }
    if (!updated) return null;
    return rowToAgentJob(updated as AgentJobRow);
  }

  async completeAgentJob(
    id: string,
    result: {
      outputJson: unknown;
      costUsd: number | null;
      tokensUsed: number | null;
    },
  ): Promise<void> {
    const { error } = await this.client
      .from('agent_jobs')
      .update({
        status: 'succeeded',
        output_json: result.outputJson,
        cost_usd: result.costUsd,
        tokens_used: result.tokensUsed,
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to complete agent job: ${error.message}`);
    }
  }

  async failAgentJob(id: string, errorMessage: string): Promise<void> {
    const { error } = await this.client
      .from('agent_jobs')
      .update({
        status: 'failed',
        error: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to mark agent job failed: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Contacts (org-wide per-owner, feeds discovery + research + outreach)
  // ---------------------------------------------------------------------------

  async insertContact(input: {
    ownerId: string;
    name: string;
    linkedinUrl: string | null;
    title: string | null;
    companyName: string | null;
    companyDomain: string | null;
    email: string | null;
    location: string | null;
    profileJson: unknown;
    researchNotes: string | null;
    embedding: number[] | null;
  }): Promise<string> {
    const { data, error } = await this.client
      .from('contacts')
      .insert({
        owner_id: input.ownerId,
        name: input.name,
        linkedin_url: input.linkedinUrl,
        title: input.title,
        company_name: input.companyName,
        company_domain: input.companyDomain,
        email: input.email,
        location: input.location,
        profile_json: input.profileJson,
        research_notes: input.researchNotes,
        embedding: formatVectorForInsert(input.embedding),
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to insert contact: ${error.message}`);
    }
    if (!data || typeof data.id !== 'string') {
      throw new Error('Contact insert returned no id');
    }
    return data.id;
  }

  /**
   * Upsert by (owner_id, linkedin_url). Relies on the
   * `contacts_owner_linkedin_unique` partial unique index from the migration.
   * Returns the merged contact.
   */
  async upsertContactByLinkedIn(input: {
    ownerId: string;
    linkedinUrl: string;
    name: string;
    title: string | null;
    companyName: string | null;
    companyDomain: string | null;
    email: string | null;
    location: string | null;
    profileJson: unknown;
    embedding: number[] | null;
  }): Promise<Contact> {
    const { data, error } = await this.client
      .from('contacts')
      .upsert(
        {
          owner_id: input.ownerId,
          linkedin_url: input.linkedinUrl,
          name: input.name,
          title: input.title,
          company_name: input.companyName,
          company_domain: input.companyDomain,
          email: input.email,
          location: input.location,
          profile_json: input.profileJson,
          embedding: formatVectorForInsert(input.embedding),
        },
        { onConflict: 'owner_id,linkedin_url' },
      )
      .select(CONTACT_COLS)
      .single();

    if (error) {
      throw new Error(`Failed to upsert contact: ${error.message}`);
    }
    return rowToContact(data as ContactRow);
  }

  async getContactById(id: string): Promise<Contact | null> {
    const { data, error } = await this.client
      .from('contacts')
      .select(CONTACT_COLS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch contact: ${error.message}`);
    }
    if (!data) return null;
    return rowToContact(data as ContactRow);
  }

  async listContactsByOwner(
    ownerId: string,
    limit: number,
  ): Promise<Contact[]> {
    const { data, error } = await this.client
      .from('contacts')
      .select(CONTACT_COLS)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list contacts: ${error.message}`);
    }
    const rows = (data ?? []) as ContactRow[];
    return rows.map(rowToContact);
  }

  /**
   * Append-or-replace research notes for a contact. Current implementation
   * overwrites — the research agent composes the full notes payload. If we
   * ever need append semantics (multiple research modes per contact), we can
   * switch to a `research_notes_history` table without changing this signature.
   */
  async updateContactResearchNotes(id: string, notes: string): Promise<void> {
    const { error } = await this.client
      .from('contacts')
      .update({ research_notes: notes })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update research notes: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Brief candidates (contact ↔ brief link with funnel status)
  // ---------------------------------------------------------------------------

  async insertCandidate(input: {
    briefId: string;
    contactId: string;
    source: CandidateSource;
    matchScore: number | null;
    status: CandidateStatus;
  }): Promise<string> {
    const { data, error } = await this.client
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

    if (error) {
      throw new Error(`Failed to insert candidate: ${error.message}`);
    }
    if (!data || typeof data.id !== 'string') {
      throw new Error('Candidate insert returned no id');
    }
    return data.id;
  }

  /**
   * Fetch a candidate along with the owner of its parent brief, so callers
   * can enforce ownership without an extra round-trip. Returns null if the
   * candidate (or its brief) does not exist.
   */
  async getCandidateById(id: string): Promise<{
    candidate: BriefCandidate;
    briefOwnerId: string;
  } | null> {
    const { data, error } = await this.client
      .from('brief_candidates')
      .select(`${CANDIDATE_COLS}, briefs!inner(owner_id)`)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch candidate: ${error.message}`);
    }
    if (!data) return null;

    // Supabase embeds the joined table under its name. With !inner, the
    // foreign row is guaranteed present.
    const joined = data as CandidateRow & {
      briefs: { owner_id: string } | { owner_id: string }[];
    };
    const briefOwner = Array.isArray(joined.briefs)
      ? joined.briefs[0]?.owner_id
      : joined.briefs?.owner_id;
    if (!briefOwner) return null;

    return {
      candidate: rowToCandidate(joined),
      briefOwnerId: briefOwner,
    };
  }

  async listCandidatesForBrief(
    briefId: string,
    limit: number,
  ): Promise<BriefCandidate[]> {
    const { data, error } = await this.client
      .from('brief_candidates')
      .select(CANDIDATE_COLS)
      .eq('brief_id', briefId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list candidates: ${error.message}`);
    }
    const rows = (data ?? []) as CandidateRow[];
    return rows.map(rowToCandidate);
  }

  async updateCandidateStatus(
    id: string,
    status: CandidateStatus,
  ): Promise<BriefCandidate | null> {
    const { data, error } = await this.client
      .from('brief_candidates')
      .update({ status })
      .eq('id', id)
      .select(CANDIDATE_COLS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update candidate status: ${error.message}`);
    }
    if (!data) return null;
    return rowToCandidate(data as CandidateRow);
  }

  /**
   * Cheap ownership probe — used by services that need to gate list queries
   * ("does this brief belong to the calling user?"). Returns false for
   * missing briefs and not-owned briefs alike.
   */
  async briefBelongsToOwner(
    briefId: string,
    ownerId: string,
  ): Promise<boolean> {
    const { data, error } = await this.client
      .from('briefs')
      .select('id')
      .eq('id', briefId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to probe brief ownership: ${error.message}`);
    }
    return !!data;
  }
}
