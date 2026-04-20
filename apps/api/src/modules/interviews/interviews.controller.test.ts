import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { InterviewsController } from './interviews.controller';
import type { InterviewsService } from './interviews.service';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };

describe('InterviewsController', () => {
  let controller: InterviewsController;
  let service: InterviewsService;

  beforeEach(() => {
    service = {
      list: vi.fn().mockResolvedValue([
        {
          interviewId: 'i1',
          briefId: 'b1',
          status: 'completed',
          durationSecs: 300,
          overallSentiment: 'positive',
          completedAt: new Date('2026-04-20T12:00:00Z'),
        },
      ]),
      get: vi.fn().mockResolvedValue({
        interviewId: 'i1',
        briefId: 'b1',
        status: 'completed',
        transcript: [{ role: 'agent', message: 'hi', timeInCallSecs: 0 }],
        analysis: null,
        durationSecs: 300,
        completedAt: new Date('2026-04-20T12:00:00Z'),
      }),
    } as unknown as InterviewsService;
    controller = new InterviewsController(service);
  });

  describe('GET /interviews', () => {
    it('defaults limit to 50 and passes undefined briefId', async () => {
      const result = await controller.list(FAKE_USER, undefined, undefined);
      expect(service.list).toHaveBeenCalledWith(FAKE_USER.id, undefined, 50);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        interviewId: 'i1',
        briefId: 'b1',
        status: 'completed',
        overallSentiment: 'positive',
      });
      expect(typeof result[0].completedAt).toBe('string');
    });

    it('forwards briefId filter', async () => {
      await controller.list(FAKE_USER, 'b1', undefined);
      expect(service.list).toHaveBeenCalledWith(FAKE_USER.id, 'b1', 50);
    });

    it('respects limit query', async () => {
      await controller.list(FAKE_USER, undefined, '10');
      expect(service.list).toHaveBeenCalledWith(FAKE_USER.id, undefined, 10);
    });

    it('clamps non-numeric limit to default', async () => {
      await controller.list(FAKE_USER, undefined, 'oops');
      expect(service.list).toHaveBeenCalledWith(FAKE_USER.id, undefined, 50);
    });

    it('serializes null completedAt as null', async () => {
      service.list = vi.fn().mockResolvedValue([
        {
          interviewId: 'i2',
          briefId: 'b1',
          status: 'failed',
          durationSecs: null,
          overallSentiment: null,
          completedAt: null,
        },
      ]);
      const result = await controller.list(FAKE_USER, undefined, undefined);
      expect(result[0].completedAt).toBeNull();
    });
  });

  describe('GET /interviews/:id', () => {
    it('returns detail shape when owned', async () => {
      const result = await controller.get('i1', FAKE_USER);
      expect(service.get).toHaveBeenCalledWith('i1', FAKE_USER.id);
      expect(result).toMatchObject({
        interviewId: 'i1',
        briefId: 'b1',
        status: 'completed',
      });
      expect(typeof result.completedAt).toBe('string');
    });

    it('returns 404 when missing or not owned (never leak existence)', async () => {
      service.get = vi.fn().mockResolvedValue(null);
      await expect(controller.get('x', FAKE_USER)).rejects.toBeInstanceOf(
        HttpException,
      );
      await expect(controller.get('x', FAKE_USER)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
