import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { BriefCandidate } from '@market-researcher/shared';
import { makeApproveCandidateHandler } from './approve-candidate.js';

const CAND_ID = '11111111-1111-1111-1111-111111111111';

describe('approve_candidate tool', () => {
  it('forwards the id and returns the new status', async () => {
    const approved: BriefCandidate = {
      id: CAND_ID,
      briefId: 'b1',
      contactId: 'c1',
      status: 'approved',
      source: 'discovery',
      matchScore: 0.9,
      interviewId: null,
      createdAt: new Date('2026-04-20T10:00:00Z'),
      updatedAt: new Date('2026-04-20T11:00:00Z'),
    };
    const client = {
      approveCandidate: vi.fn().mockResolvedValue(approved),
    } as unknown as ApiClient;

    const handler = makeApproveCandidateHandler(client);
    const result = await handler({ candidateId: CAND_ID });
    expect(client.approveCandidate).toHaveBeenCalledWith(CAND_ID);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('approved');
    expect(payload.candidateId).toBe(CAND_ID);
  });
});
