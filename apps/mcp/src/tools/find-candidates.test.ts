import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import { makeFindCandidatesHandler } from './find-candidates.js';

const BRIEF_ID = '11111111-1111-1111-1111-111111111111';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    runDiscovery: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('find_candidates tool', () => {
  it('enqueues a discovery run with the provided args', async () => {
    const client = makeClient({
      runDiscovery: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    });
    const handler = makeFindCandidatesHandler(client);

    const result = await handler({
      briefId: BRIEF_ID,
      limit: 15,
      extraCriteria: 'Series A founders',
    });

    expect(client.runDiscovery).toHaveBeenCalledWith({
      briefId: BRIEF_ID,
      limit: 15,
      extraCriteria: 'Series A founders',
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.jobId).toBe('job-1');
    expect(payload.status).toBe('queued');
    expect(payload.next).toMatch(/get_job_status/);
  });

  it('leaves limit/extraCriteria out when not provided', async () => {
    const client = makeClient({
      runDiscovery: vi.fn().mockResolvedValue({ jobId: 'job-2' }),
    });
    const handler = makeFindCandidatesHandler(client);
    await handler({ briefId: BRIEF_ID });
    expect(client.runDiscovery).toHaveBeenCalledWith({
      briefId: BRIEF_ID,
      limit: undefined,
      extraCriteria: undefined,
    });
  });
});
