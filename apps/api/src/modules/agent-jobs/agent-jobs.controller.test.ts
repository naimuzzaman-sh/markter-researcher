import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AgentJobsController } from './agent-jobs.controller';
import type { AgentJobsService } from './agent-jobs.service';
import type { AgentJob } from '@market-researcher/shared';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };

const makeJob = (overrides: Partial<AgentJob> = {}): AgentJob => ({
  id: 'job-1',
  ownerId: FAKE_USER.id,
  kind: 'discovery',
  status: 'queued',
  inputJson: { briefId: 'b1' },
  outputJson: null,
  error: null,
  costUsd: null,
  tokensUsed: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date('2026-04-20T12:00:00Z'),
  ...overrides,
});

describe('AgentJobsController', () => {
  let controller: AgentJobsController;
  let service: AgentJobsService;

  beforeEach(() => {
    service = {
      getJob: vi.fn().mockResolvedValue(makeJob()),
      listJobs: vi.fn().mockResolvedValue([makeJob(), makeJob({ id: 'job-2' })]),
    } as unknown as AgentJobsService;
    controller = new AgentJobsController(service);
  });

  describe('GET /agent-jobs/:id', () => {
    it('returns the job shape scoped to the authenticated user', async () => {
      const result = await controller.getJob('job-1', FAKE_USER);
      expect(service.getJob).toHaveBeenCalledWith('job-1', FAKE_USER.id);
      expect(result).toMatchObject({
        jobId: 'job-1',
        kind: 'discovery',
        status: 'queued',
      });
      expect(typeof result.createdAt).toBe('string');
    });

    it('serializes succeeded job output', async () => {
      service.getJob = vi.fn().mockResolvedValue(
        makeJob({
          status: 'succeeded',
          outputJson: { candidateCount: 5 },
          costUsd: 0.012,
          tokensUsed: 4200,
          startedAt: new Date('2026-04-20T12:05:00Z'),
          finishedAt: new Date('2026-04-20T12:05:30Z'),
        }),
      );
      const result = await controller.getJob('job-1', FAKE_USER);
      expect(result.status).toBe('succeeded');
      expect(result.output).toEqual({ candidateCount: 5 });
      expect(result.costUsd).toBe(0.012);
      expect(result.tokensUsed).toBe(4200);
    });

    it('returns 404 when the job is missing (or owned by another user)', async () => {
      service.getJob = vi.fn().mockResolvedValue(null);
      await expect(
        controller.getJob('missing', FAKE_USER),
      ).rejects.toBeInstanceOf(HttpException);
      await expect(
        controller.getJob('missing', FAKE_USER),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('GET /agent-jobs', () => {
    it('returns the authenticated user\'s jobs with default limit', async () => {
      const result = await controller.listJobs(FAKE_USER, undefined);
      expect(service.listJobs).toHaveBeenCalledWith(FAKE_USER.id, 20);
      expect(result).toHaveLength(2);
      expect(result[0].jobId).toBe('job-1');
    });

    it('honours the limit query param when provided', async () => {
      await controller.listJobs(FAKE_USER, '50');
      expect(service.listJobs).toHaveBeenCalledWith(FAKE_USER.id, 50);
    });

    it('clamps non-numeric limit to the default', async () => {
      await controller.listJobs(FAKE_USER, 'abc');
      expect(service.listJobs).toHaveBeenCalledWith(FAKE_USER.id, 20);
    });

    it('clamps limit above the max', async () => {
      await controller.listJobs(FAKE_USER, '10000');
      expect(service.listJobs).toHaveBeenCalledWith(FAKE_USER.id, 100);
    });
  });
});
