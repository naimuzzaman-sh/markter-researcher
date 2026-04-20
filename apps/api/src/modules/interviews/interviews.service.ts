import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../persistence/supabase.service';
import type {
  InterviewDetail,
  InterviewSummary,
} from '@market-researcher/shared';

/**
 * Thin orchestration over SupabaseService for owner-scoped interview reads.
 * The MCP re-implements these same queries against a user-JWT-bearing
 * Supabase client, so this service is deliberately a straight pass-through —
 * all policy (owner filtering, null-on-missing) lives in SupabaseService.
 */
@Injectable()
export class InterviewsService {
  constructor(private readonly persistence: SupabaseService) {}

  async list(
    ownerId: string,
    briefId: string | undefined,
    limit: number,
  ): Promise<InterviewSummary[]> {
    return this.persistence.listInterviews(ownerId, briefId, limit);
  }

  async get(
    interviewId: string,
    ownerId: string,
  ): Promise<InterviewDetail | null> {
    return this.persistence.getInterviewById(interviewId, ownerId);
  }
}
