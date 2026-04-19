import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SavedInterview } from '../../types/saved-interview.type';
import type { Brief } from '../../types/brief.type';
import {
  researchContextSchema,
  type ResearchContext,
} from '../../types/research-context.type';

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

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  /**
   * Verify a Supabase-issued JWT by asking Supabase to decode it.
   * Returns the authenticated user, or null if the token is missing/invalid/expired.
   * We explicitly swallow network errors and return null so callers can throw a
   * clean 401 regardless of upstream failure mode.
   */
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
}
