import { describe, it, expect } from 'vitest';
import {
  agentJobSchema,
  agentJobKindSchema,
  agentJobStatusSchema,
} from './agent-job.type';

const validJob = {
  id: '0fe3b0f0-4c55-4a0d-8e8c-2aaf2b1e1a11',
  ownerId: '11111111-1111-1111-1111-111111111111',
  kind: 'discovery' as const,
  status: 'queued' as const,
  inputJson: { briefId: 'b1', limit: 10 },
  outputJson: null,
  error: null,
  costUsd: null,
  tokensUsed: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date(),
};

describe('agentJobKindSchema', () => {
  it('accepts discovery, research, outreach', () => {
    for (const kind of ['discovery', 'research', 'outreach']) {
      expect(agentJobKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it('rejects unknown kinds', () => {
    expect(agentJobKindSchema.safeParse('analysis').success).toBe(false);
  });
});

describe('agentJobStatusSchema', () => {
  it('accepts queued, running, succeeded, failed', () => {
    for (const s of ['queued', 'running', 'succeeded', 'failed']) {
      expect(agentJobStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects unknown statuses', () => {
    expect(agentJobStatusSchema.safeParse('pending').success).toBe(false);
  });
});

describe('agentJobSchema', () => {
  it('validates a correct queued job', () => {
    expect(agentJobSchema.safeParse(validJob).success).toBe(true);
  });

  it('validates a succeeded job with output and timings', () => {
    const done = {
      ...validJob,
      status: 'succeeded' as const,
      outputJson: { candidateCount: 7 },
      costUsd: 0.0123,
      tokensUsed: 4200,
      startedAt: new Date(),
      finishedAt: new Date(),
    };
    expect(agentJobSchema.safeParse(done).success).toBe(true);
  });

  it('rejects missing ownerId', () => {
    const { ownerId: _owner, ...rest } = validJob;
    void _owner;
    expect(agentJobSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid kind', () => {
    expect(
      agentJobSchema.safeParse({ ...validJob, kind: 'bogus' }).success,
    ).toBe(false);
  });

  it('rejects non-UUID id', () => {
    expect(agentJobSchema.safeParse({ ...validJob, id: '' }).success).toBe(
      false,
    );
  });

  it('allows error string on failed job', () => {
    const failed = {
      ...validJob,
      status: 'failed' as const,
      error: 'EXA request timed out',
    };
    expect(agentJobSchema.safeParse(failed).success).toBe(true);
  });
});
