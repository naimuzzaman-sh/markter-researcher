import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { BriefCandidate } from '@market-researcher/shared';
import { makeListCandidatesForBriefHandler } from './list-candidates-for-brief.js';

const BRIEF_ID = '11111111-1111-1111-1111-111111111111';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listCandidatesForBrief: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const fakeCand: BriefCandidate = {
  id: 'cand-1',
  briefId: BRIEF_ID,
  contactId: 'contact-1',
  status: 'pending_review',
  source: 'discovery',
  matchScore: 0.87,
  interviewId: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
};

describe('list_candidates_for_brief tool', () => {
  it('forwards limit and returns wire payload', async () => {
    const client = makeClient({
      listCandidatesForBrief: vi.fn().mockResolvedValue([fakeCand]),
    });
    const handler = makeListCandidatesForBriefHandler(client);
    const result = await handler({ briefId: BRIEF_ID, limit: 5 });
    expect(client.listCandidatesForBrief).toHaveBeenCalledWith(BRIEF_ID, 5);
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual([
      {
        candidateId: 'cand-1',
        contactId: 'contact-1',
        status: 'pending_review',
        source: 'discovery',
        matchScore: 0.87,
        createdAt: '2026-04-20T10:00:00.000Z',
      },
    ]);
  });

  it('defaults limit to 20', async () => {
    const client = makeClient({
      listCandidatesForBrief: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListCandidatesForBriefHandler(client);
    await handler({ briefId: BRIEF_ID });
    expect(client.listCandidatesForBrief).toHaveBeenCalledWith(BRIEF_ID, 20);
  });

  it('returns a helpful message when no candidates exist', async () => {
    const client = makeClient({
      listCandidatesForBrief: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListCandidatesForBriefHandler(client);
    const result = await handler({ briefId: BRIEF_ID });
    expect(result.content[0].text).toMatch(/No candidates yet/);
  });
});
