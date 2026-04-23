import type { SupabaseService } from './supabase.service';
import type {
  BriefCandidate,
  CandidateSource,
  CandidateStatus,
} from './types/candidate.type';

type CreateCandidateInput = {
  briefId: string;
  contactId: string;
  source: CandidateSource;
  matchScore: number | null;
  status: CandidateStatus;
};

/**
 * Thin orchestration for `brief_candidates`. Ownership is enforced through
 * the parent brief — a candidate "belongs to" the user who owns its brief.
 * We consult `briefBelongsToOwner(briefId, ownerId)` before any mutation or
 * list to keep that enforcement in one place.
 */
export class CandidatesService {
  constructor(private readonly persistence: SupabaseService) {}

  async createCandidate(input: CreateCandidateInput): Promise<{ id: string }> {
    const id = await this.persistence.insertCandidate(input);
    return { id };
  }

  async getCandidate(
    id: string,
    ownerId: string,
  ): Promise<BriefCandidate | null> {
    const row = await this.persistence.getCandidateById(id);
    if (!row) return null;
    if (row.briefOwnerId !== ownerId) return null;
    return row.candidate;
  }

  async listForBrief(
    briefId: string,
    ownerId: string,
    limit: number,
  ): Promise<BriefCandidate[]> {
    const owns = await this.persistence.briefBelongsToOwner(briefId, ownerId);
    if (!owns) return [];
    return this.persistence.listCandidatesForBrief(briefId, limit);
  }

  async approve(
    id: string,
    ownerId: string,
  ): Promise<BriefCandidate | null> {
    return this.transition(id, ownerId, 'approved');
  }

  async reject(
    id: string,
    ownerId: string,
  ): Promise<BriefCandidate | null> {
    return this.transition(id, ownerId, 'rejected');
  }

  private async transition(
    id: string,
    ownerId: string,
    next: CandidateStatus,
  ): Promise<BriefCandidate | null> {
    const row = await this.persistence.getCandidateById(id);
    if (!row) return null;
    if (row.briefOwnerId !== ownerId) return null;
    return this.persistence.updateCandidateStatus(id, next);
  }
}
