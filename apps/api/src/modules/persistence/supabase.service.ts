import { Injectable } from '@nestjs/common';
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

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
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

  async insertBrief(researchContext: ResearchContext): Promise<string> {
    const { data, error } = await this.client
      .from('briefs')
      .insert({ research_context: researchContext })
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
