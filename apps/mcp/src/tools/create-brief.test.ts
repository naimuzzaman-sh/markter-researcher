import { describe, it, expect, vi } from 'vitest';
import type { ResearchContext } from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';
import { makeCreateBriefHandler } from './create-brief.js';

const validContext: ResearchContext = {
  company: { name: 'Co', industry: 'SaaS', description: 'desc' },
  product: {
    name: 'Acme Forms',
    description: 'd',
    keyFeatures: ['a'],
    targetAudience: 'ta',
  },
  research: {
    objective: 'obj',
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
    createBrief: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('create_brief tool', () => {
  it('POSTs the brief and returns briefId + shareable URL on success', async () => {
    const client = makeClient({
      createBrief: vi.fn().mockResolvedValue({ briefId: 'b-new' }),
    });
    const handler = makeCreateBriefHandler(client, 'https://app.example.com');

    const result = await handler({ context: validContext });
    expect(client.createBrief).toHaveBeenCalledWith(validContext);

    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual({
      briefId: 'b-new',
      shareableUrl: 'https://app.example.com/interview/b-new',
    });
  });

  it('returns a validation-error message WITHOUT calling the API when context is invalid', async () => {
    const createBrief = vi.fn();
    const client = makeClient({ createBrief });
    const handler = makeCreateBriefHandler(client, 'https://app.example.com');

    const result = await handler({
      context: { company: { name: 'Only a name' } } as unknown as ResearchContext,
    });

    expect(createBrief).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/invalid/i);
  });

  it('surfaces the API error when the backend rejects the create', async () => {
    const client = makeClient({
      createBrief: vi.fn().mockRejectedValue(new Error('HTTP 500: db down')),
    });
    const handler = makeCreateBriefHandler(client, 'https://app.example.com');

    const result = await handler({ context: validContext });
    expect(result.content[0].text).toMatch(/failed to create/i);
    expect(result.content[0].text).toMatch(/db down/);
  });
});
