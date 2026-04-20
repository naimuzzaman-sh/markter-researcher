import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterviewsService } from './interviews.service';
import type { SupabaseService } from '../persistence/supabase.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let persistence: SupabaseService;

  beforeEach(() => {
    persistence = {
      listInterviews: vi.fn().mockResolvedValue([
        {
          interviewId: 'i1',
          briefId: 'b1',
          status: 'completed',
          durationSecs: 300,
          overallSentiment: 'positive',
          completedAt: new Date('2026-04-20T12:00:00Z'),
        },
      ]),
      getInterviewById: vi.fn().mockResolvedValue({
        interviewId: 'i1',
        briefId: 'b1',
        status: 'completed',
        transcript: [],
        analysis: null,
        durationSecs: 300,
        completedAt: new Date('2026-04-20T12:00:00Z'),
      }),
    } as unknown as SupabaseService;
    service = new InterviewsService(persistence);
  });

  describe('list', () => {
    it('forwards ownerId, briefId and limit to persistence', async () => {
      const list = await service.list('owner-1', 'b1', 10);
      expect(persistence.listInterviews).toHaveBeenCalledWith(
        'owner-1',
        'b1',
        10,
      );
      expect(list).toHaveLength(1);
    });

    it('forwards undefined briefId when none given', async () => {
      await service.list('owner-1', undefined, 10);
      expect(persistence.listInterviews).toHaveBeenCalledWith(
        'owner-1',
        undefined,
        10,
      );
    });
  });

  describe('get', () => {
    it('forwards interviewId + ownerId to persistence', async () => {
      const detail = await service.get('i1', 'owner-1');
      expect(persistence.getInterviewById).toHaveBeenCalledWith(
        'i1',
        'owner-1',
      );
      expect(detail?.interviewId).toBe('i1');
    });

    it('returns null when persistence returns null', async () => {
      persistence.getInterviewById = vi.fn().mockResolvedValue(null);
      const detail = await service.get('missing', 'owner-1');
      expect(detail).toBeNull();
    });
  });
});
