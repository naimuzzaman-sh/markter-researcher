import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentJobsService } from './agent-jobs.service';
import type { SupabaseService } from './supabase.service';
import type { AgentJob } from './types/agent-job.type';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER_OWNER = '22222222-2222-2222-2222-222222222222';
const JOB_ID = '33333333-3333-3333-3333-333333333333';

const fakeJob: AgentJob = {
  id: JOB_ID,
  ownerId: OWNER,
  kind: 'discovery',
  status: 'queued',
  inputJson: { briefId: 'b1', limit: 10 },
  outputJson: null,
  error: null,
  costUsd: null,
  tokensUsed: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
};

describe('AgentJobsService', () => {
  let service: AgentJobsService;
  let persistence: SupabaseService;

  beforeEach(() => {
    persistence = {
      insertAgentJob: vi.fn().mockResolvedValue(JOB_ID),
      getAgentJobById: vi.fn().mockResolvedValue(fakeJob),
      listAgentJobsByOwner: vi.fn().mockResolvedValue([fakeJob]),
      claimNextQueuedJob: vi.fn().mockResolvedValue(fakeJob),
      completeAgentJob: vi.fn().mockResolvedValue(undefined),
      failAgentJob: vi.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseService;
    service = new AgentJobsService(persistence);
  });

  describe('enqueue', () => {
    it('inserts a queued job and returns the new id', async () => {
      const { id } = await service.enqueue({
        ownerId: OWNER,
        kind: 'discovery',
        input: { briefId: 'b1', limit: 10 },
      });
      expect(id).toBe(JOB_ID);
      expect(persistence.insertAgentJob).toHaveBeenCalledWith({
        ownerId: OWNER,
        kind: 'discovery',
        inputJson: { briefId: 'b1', limit: 10 },
      });
    });
  });

  describe('getJob', () => {
    it('returns a job scoped to the requesting owner', async () => {
      const job = await service.getJob(JOB_ID, OWNER);
      expect(job).not.toBeNull();
      expect(job?.id).toBe(JOB_ID);
      expect(persistence.getAgentJobById).toHaveBeenCalledWith(JOB_ID);
    });

    it('returns null when the job does not exist', async () => {
      persistence.getAgentJobById = vi.fn().mockResolvedValue(null);
      const job = await service.getJob('missing', OWNER);
      expect(job).toBeNull();
    });

    it('returns null when the job belongs to a different owner', async () => {
      const job = await service.getJob(JOB_ID, OTHER_OWNER);
      expect(job).toBeNull();
    });
  });

  describe('listJobs', () => {
    it('delegates to persistence with owner + limit', async () => {
      const jobs = await service.listJobs(OWNER, 25);
      expect(persistence.listAgentJobsByOwner).toHaveBeenCalledWith(OWNER, 25);
      expect(jobs).toHaveLength(1);
    });
  });

  describe('claimNext', () => {
    it('delegates to persistence and returns the claimed job', async () => {
      const job = await service.claimNext();
      expect(job?.id).toBe(JOB_ID);
      expect(persistence.claimNextQueuedJob).toHaveBeenCalled();
    });

    it('returns null when no queued jobs are available', async () => {
      persistence.claimNextQueuedJob = vi.fn().mockResolvedValue(null);
      expect(await service.claimNext()).toBeNull();
    });
  });

  describe('complete', () => {
    it('passes output, cost, and tokens to persistence', async () => {
      await service.complete(JOB_ID, {
        output: { candidateCount: 7 },
        costUsd: 0.012,
        tokensUsed: 4200,
      });
      expect(persistence.completeAgentJob).toHaveBeenCalledWith(JOB_ID, {
        outputJson: { candidateCount: 7 },
        costUsd: 0.012,
        tokensUsed: 4200,
      });
    });

    it('works with only output (no cost/tokens)', async () => {
      await service.complete(JOB_ID, { output: { ok: true } });
      expect(persistence.completeAgentJob).toHaveBeenCalledWith(JOB_ID, {
        outputJson: { ok: true },
        costUsd: null,
        tokensUsed: null,
      });
    });
  });

  describe('fail', () => {
    it('records the error message', async () => {
      await service.fail(JOB_ID, 'EXA request timed out');
      expect(persistence.failAgentJob).toHaveBeenCalledWith(
        JOB_ID,
        'EXA request timed out',
      );
    });
  });
});
