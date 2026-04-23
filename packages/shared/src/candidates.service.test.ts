import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CandidatesService } from './candidates.service';
import type { SupabaseService } from './supabase.service';
import type { BriefCandidate } from './types/candidate.type';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER_OWNER = '22222222-2222-2222-2222-222222222222';
const BRIEF_ID = '33333333-3333-3333-3333-333333333333';
const CONTACT_ID = '44444444-4444-4444-4444-444444444444';
const CAND_ID = '55555555-5555-5555-5555-555555555555';

const fakeCandidate: BriefCandidate = {
  id: CAND_ID,
  briefId: BRIEF_ID,
  contactId: CONTACT_ID,
  status: 'pending_review',
  source: 'discovery',
  matchScore: 0.87,
  interviewId: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
};

describe('CandidatesService', () => {
  let service: CandidatesService;
  let persistence: SupabaseService;

  beforeEach(() => {
    persistence = {
      insertCandidate: vi.fn().mockResolvedValue(CAND_ID),
      getCandidateById: vi.fn().mockResolvedValue({
        candidate: fakeCandidate,
        briefOwnerId: OWNER,
      }),
      listCandidatesForBrief: vi.fn().mockResolvedValue([fakeCandidate]),
      updateCandidateStatus: vi.fn().mockResolvedValue(fakeCandidate),
      briefBelongsToOwner: vi.fn().mockResolvedValue(true),
    } as unknown as SupabaseService;
    service = new CandidatesService(persistence);
  });

  describe('createCandidate', () => {
    it('creates a pending_review candidacy and returns its id', async () => {
      const { id } = await service.createCandidate({
        briefId: BRIEF_ID,
        contactId: CONTACT_ID,
        source: 'discovery',
        matchScore: 0.87,
        status: 'pending_review',
      });
      expect(id).toBe(CAND_ID);
      expect(persistence.insertCandidate).toHaveBeenCalledWith({
        briefId: BRIEF_ID,
        contactId: CONTACT_ID,
        source: 'discovery',
        matchScore: 0.87,
        status: 'pending_review',
      });
    });
  });

  describe('getCandidate', () => {
    it('returns a candidate when the requesting user owns the brief', async () => {
      const result = await service.getCandidate(CAND_ID, OWNER);
      expect(result?.id).toBe(CAND_ID);
      expect(persistence.getCandidateById).toHaveBeenCalledWith(CAND_ID);
    });

    it('returns null when the candidate does not exist', async () => {
      persistence.getCandidateById = vi.fn().mockResolvedValue(null);
      expect(await service.getCandidate('missing', OWNER)).toBeNull();
    });

    it('returns null when the brief is owned by a different user', async () => {
      expect(await service.getCandidate(CAND_ID, OTHER_OWNER)).toBeNull();
    });
  });

  describe('listForBrief', () => {
    it('returns candidates only when the brief belongs to the caller', async () => {
      const list = await service.listForBrief(BRIEF_ID, OWNER, 50);
      expect(persistence.briefBelongsToOwner).toHaveBeenCalledWith(
        BRIEF_ID,
        OWNER,
      );
      expect(persistence.listCandidatesForBrief).toHaveBeenCalledWith(
        BRIEF_ID,
        50,
      );
      expect(list).toHaveLength(1);
    });

    it('returns empty list when brief is owned by a different user', async () => {
      persistence.briefBelongsToOwner = vi.fn().mockResolvedValue(false);
      const list = await service.listForBrief(BRIEF_ID, OTHER_OWNER, 50);
      expect(list).toEqual([]);
      expect(persistence.listCandidatesForBrief).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('transitions pending_review → approved when the caller owns the brief', async () => {
      const updated = await service.approve(CAND_ID, OWNER);
      expect(persistence.updateCandidateStatus).toHaveBeenCalledWith(
        CAND_ID,
        'approved',
      );
      expect(updated).not.toBeNull();
    });

    it('returns null when the candidate is not found', async () => {
      persistence.getCandidateById = vi.fn().mockResolvedValue(null);
      expect(await service.approve('missing', OWNER)).toBeNull();
    });

    it('returns null when the brief belongs to a different user', async () => {
      expect(await service.approve(CAND_ID, OTHER_OWNER)).toBeNull();
      expect(persistence.updateCandidateStatus).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('transitions the candidate to rejected', async () => {
      await service.reject(CAND_ID, OWNER);
      expect(persistence.updateCandidateStatus).toHaveBeenCalledWith(
        CAND_ID,
        'rejected',
      );
    });

    it('returns null when the caller does not own the brief', async () => {
      expect(await service.reject(CAND_ID, OTHER_OWNER)).toBeNull();
      expect(persistence.updateCandidateStatus).not.toHaveBeenCalled();
    });
  });
});
