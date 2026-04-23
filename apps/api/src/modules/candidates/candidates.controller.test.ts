import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import type { CandidatesService } from './candidates.service';
import type { BriefCandidate } from '@market-researcher/shared';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };

const makeCand = (overrides: Partial<BriefCandidate> = {}): BriefCandidate => ({
  id: 'cand-1',
  briefId: 'brief-1',
  contactId: 'contact-1',
  status: 'pending_review',
  source: 'discovery',
  matchScore: 0.87,
  interviewId: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
  ...overrides,
});

describe('CandidatesController', () => {
  let controller: CandidatesController;
  let service: CandidatesService;

  beforeEach(() => {
    service = {
      getCandidate: vi.fn().mockResolvedValue(makeCand()),
      listForBrief: vi.fn().mockResolvedValue([makeCand(), makeCand({ id: 'cand-2' })]),
      approve: vi.fn().mockResolvedValue(makeCand({ status: 'approved' })),
      reject: vi.fn().mockResolvedValue(makeCand({ status: 'rejected' })),
    } as unknown as CandidatesService;
    controller = new CandidatesController(service);
  });

  describe('GET /candidates/:id', () => {
    it('returns the candidate shape', async () => {
      const result = await controller.getCandidate('cand-1', FAKE_USER);
      expect(service.getCandidate).toHaveBeenCalledWith('cand-1', FAKE_USER.id);
      expect(result).toMatchObject({
        candidateId: 'cand-1',
        briefId: 'brief-1',
        contactId: 'contact-1',
        status: 'pending_review',
      });
    });

    it('returns 404 when missing or not owned', async () => {
      service.getCandidate = vi.fn().mockResolvedValue(null);
      await expect(
        controller.getCandidate('missing', FAKE_USER),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('GET /briefs/:briefId/candidates', () => {
    it('lists candidates for a brief with default limit', async () => {
      const result = await controller.listForBrief('brief-1', FAKE_USER, undefined);
      expect(service.listForBrief).toHaveBeenCalledWith('brief-1', FAKE_USER.id, 20);
      expect(result).toHaveLength(2);
    });

    it('honours limit param', async () => {
      await controller.listForBrief('brief-1', FAKE_USER, '50');
      expect(service.listForBrief).toHaveBeenCalledWith('brief-1', FAKE_USER.id, 50);
    });
  });

  describe('POST /candidates/:id/approve', () => {
    it('transitions to approved and returns the candidate', async () => {
      const result = await controller.approve('cand-1', FAKE_USER);
      expect(service.approve).toHaveBeenCalledWith('cand-1', FAKE_USER.id);
      expect(result.status).toBe('approved');
    });

    it('returns 404 when caller cannot act on the candidate', async () => {
      service.approve = vi.fn().mockResolvedValue(null);
      await expect(
        controller.approve('cand-1', FAKE_USER),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('POST /candidates/:id/reject', () => {
    it('transitions to rejected and returns the candidate', async () => {
      const result = await controller.reject('cand-1', FAKE_USER);
      expect(service.reject).toHaveBeenCalledWith('cand-1', FAKE_USER.id);
      expect(result.status).toBe('rejected');
    });

    it('returns 404 when caller cannot act on the candidate', async () => {
      service.reject = vi.fn().mockResolvedValue(null);
      await expect(
        controller.reject('cand-1', FAKE_USER),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });
});
