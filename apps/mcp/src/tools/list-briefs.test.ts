import { describe, it, expect, vi } from 'vitest';
import type { ResearchContext } from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';
import { makeListBriefsHandler } from './list-briefs.js';

const sampleContext: ResearchContext = {
  company: { name: 'Co', industry: 'SaaS', description: 'desc' },
  product: {
    name: 'Acme Forms',
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
  interviewSettings: {
    maxDurationMinutes: 5,
    tone: 'friendly',
    language: 'en',
  },
};

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listBriefs: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('list_briefs tool', () => {
  it('defaults limit to 20 when no args provided', async () => {
    const client = makeClient({
      listBriefs: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListBriefsHandler(client, 'https://app.example.com');
    await handler({});
    expect(client.listBriefs).toHaveBeenCalledWith(20);
  });

  it('forwards an explicit limit', async () => {
    const client = makeClient({
      listBriefs: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListBriefsHandler(client, 'https://app.example.com');
    await handler({ limit: 5 });
    expect(client.listBriefs).toHaveBeenCalledWith(5);
  });

  it('projects each brief to { briefId, productName, objective, createdAt, shareableUrl }', async () => {
    const client = makeClient({
      listBriefs: vi.fn().mockResolvedValue([
        {
          id: 'b1',
          researchContext: sampleContext,
          createdAt: new Date('2026-04-20T12:00:00Z'),
        },
      ]),
    });
    const handler = makeListBriefsHandler(client, 'https://app.example.com');

    const result = await handler({});
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual([
      {
        briefId: 'b1',
        productName: 'Acme Forms',
        objective: 'learn about onboarding',
        createdAt: '2026-04-20T12:00:00.000Z',
        shareableUrl: 'https://app.example.com/interview/b1',
      },
    ]);
  });

  it('returns a helpful message when the user has no briefs', async () => {
    const client = makeClient({
      listBriefs: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListBriefsHandler(client, 'https://app.example.com');
    const result = await handler({});
    expect(result.content[0].text).toMatch(/no briefs/i);
  });
});
