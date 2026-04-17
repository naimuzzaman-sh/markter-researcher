import { Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SavedInterview } from '../../types/saved-interview.type';

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
}
