import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { BriefCandidate } from '@market-researcher/shared';
import { makeGetCandidateHandler } from './get-candidate.js';

const CAND_ID = '11111111-1111-1111-1111-111111111111';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getCandidate: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const fakeCand: BriefCandidate = {
  id: CAND_ID,
  briefId: '22222222-2222-2222-2222-222222222222',
  contactId: '33333333-3333-3333-3333-333333333333',
  status: 'approved',
  source: 'discovery',
  matchScore: 0.91,
  interviewId: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T11:00:00Z'),
};

describe('get_candidate tool', () => {
  it('returns the candidate shape', async () => {
    const client = makeClient({
      getCandidate: vi.fn().mockResolvedValue(fakeCand),
    });
    const handler = makeGetCandidateHandler(client);
    const result = await handler({ candidateId: CAND_ID });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.candidateId).toBe(CAND_ID);
    expect(payload.status).toBe('approved');
  });

  it('returns a helpful message when the candidate is missing', async () => {
    const client = makeClient({
      getCandidate: vi.fn().mockResolvedValue(null),
    });
    const handler = makeGetCandidateHandler(client);
    const result = await handler({ candidateId: CAND_ID });
    expect(result.content[0].text).toMatch(/not found/);
  });
});
