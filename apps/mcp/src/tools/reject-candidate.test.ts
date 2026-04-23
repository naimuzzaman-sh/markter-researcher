import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { BriefCandidate } from '@market-researcher/shared';
import { makeRejectCandidateHandler } from './reject-candidate.js';

const CAND_ID = '11111111-1111-1111-1111-111111111111';

describe('reject_candidate tool', () => {
  it('forwards the id and returns the new status', async () => {
    const rejected: BriefCandidate = {
      id: CAND_ID,
      briefId: 'b1',
      contactId: 'c1',
      status: 'rejected',
      source: 'discovery',
      matchScore: 0.2,
      interviewId: null,
      createdAt: new Date('2026-04-20T10:00:00Z'),
      updatedAt: new Date('2026-04-20T11:00:00Z'),
    };
    const client = {
      rejectCandidate: vi.fn().mockResolvedValue(rejected),
    } as unknown as ApiClient;

    const handler = makeRejectCandidateHandler(client);
    const result = await handler({ candidateId: CAND_ID });
    expect(client.rejectCandidate).toHaveBeenCalledWith(CAND_ID);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('rejected');
  });
});
