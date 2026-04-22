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
   * Write a new researchContext onto an existing brief, scoped to its owner.
   * The `eq('owner_id', ownerId)` filter is the authoritative ownership check:
   * if the row exists but is owned by someone else, the UPDATE touches zero
   * rows and we return null. Callers treat null as "not yours or doesn't
   * exist" — we deliberately don't distinguish those cases.
   */
  async updateBriefById(
    briefId: string,
    ownerId: string,
    researchContext: ResearchContext,
  ): Promise<Brief | null> {
    const { data, error } = await this.client
      .from('briefs')
      .update({ research_context: researchContext })
      .eq('id', briefId)
      .eq('owner_id', ownerId)
      .select('id, research_context, created_at')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update brief: ${error.message}`);
    }
    if (!data) return null;

    const row = data as BriefRow;
    return {
      id: row.id,
      researchContext: researchContextSchema.parse(row.research_context),
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
}
