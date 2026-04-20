import { describe, it, expect, vi } from 'vitest';
import type { ResearchContext } from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';
import { makeGetBriefHandler } from './get-brief.js';

const sampleContext: ResearchContext = {
  company: { name: 'Co', industry: 'SaaS', description: 'desc' },
  product: {
    name: 'P',
    description: 'd',
    keyFeatures: ['a'],
    targetAudience: 'ta',
  },
  research: {
    objective: 'learn about onboarding',
    questions: [
      { id: 'q1', text: 'Q?', followUp: 'F?', category: 'background' },
    ],
    concerns: [],
    productMarketFit: { hypothesis: 'h', signals: [] },
  },
  interviewSettings: { maxDurationMinutes: 5, tone: 'friendly', language: 'en' },
};

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getBrief: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('get_brief tool', () => {
  it('returns a formatted brief payload with shareableUrl when found', async () => {
    const client = makeClient({
      getBrief: vi.fn().mockResolvedValue({
        id: 'b1',
        researchContext: sampleContext,
        createdAt: new Date('2026-04-20T12:00:00Z'),
      }),
    });
    const handler = makeGetBriefHandler(client, 'https://app.example.com');

    const result = await handler({ briefId: 'b1' });

    expect(client.getBrief).toHaveBeenCalledWith('b1');
    expect(result.content[0].type).toBe('text');
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toMatchObject({
      briefId: 'b1',
      researchContext: sampleContext,
      shareableUrl: 'https://app.example.com/interview/b1',
    });
    expect(payload.createdAt).toBe('2026-04-20T12:00:00.000Z');
  });

  it('returns a helpful not-found message when the brief is missing', async () => {
    const client = makeClient({
      getBrief: vi.fn().mockResolvedValue(null),
    });
    const handler = makeGetBriefHandler(client, 'https://app.example.com');

    const result = await handler({ briefId: 'missing' });
    expect(client.getBrief).toHaveBeenCalledWith('missing');
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
