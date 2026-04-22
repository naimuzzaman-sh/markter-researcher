import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { AgentJob } from '@market-researcher/shared';
import { makeGetJobStatusHandler } from './get-job-status.js';

const JOB_ID = '11111111-1111-1111-1111-111111111111';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getAgentJob: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const fakeJob: AgentJob = {
  id: JOB_ID,
  ownerId: '',
  kind: 'discovery',
  status: 'succeeded',
  inputJson: { briefId: 'b1', limit: 10 },
  outputJson: { candidateCount: 5, skipped: 2, errors: 0 },
  error: null,
  costUsd: 0.012,
  tokensUsed: 4200,
  startedAt: new Date('2026-04-20T10:05:00Z'),
  finishedAt: new Date('2026-04-20T10:05:30Z'),
  createdAt: new Date('2026-04-20T10:05:00Z'),
};

describe('get_job_status tool', () => {
  it('returns the job shape on success', async () => {
    const client = makeClient({
      getAgentJob: vi.fn().mockResolvedValue(fakeJob),
    });
    const handler = makeGetJobStatusHandler(client);
    const result = await handler({ jobId: JOB_ID });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.jobId).toBe(JOB_ID);
    expect(payload.status).toBe('succeeded');
    expect(payload.output).toEqual({
      candidateCount: 5,
      skipped: 2,
      errors: 0,
    });
    expect(payload.finishedAt).toBe('2026-04-20T10:05:30.000Z');
  });

  it('returns a helpful message when the job is missing', async () => {
    const client = makeClient({
      getAgentJob: vi.fn().mockResolvedValue(null),
    });
    const handler = makeGetJobStatusHandler(client);
    const result = await handler({ jobId: JOB_ID });
    expect(result.content[0].text).toMatch(/No agent job found/);
  });
});
