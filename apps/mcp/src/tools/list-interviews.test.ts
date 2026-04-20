import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import { makeListInterviewsHandler } from './list-interviews.js';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listInterviews: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('list_interviews tool', () => {
  it('calls the API with defaults when no args provided', async () => {
    const client = makeClient({
      listInterviews: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListInterviewsHandler(client);
    await handler({});
    expect(client.listInterviews).toHaveBeenCalledWith(undefined, 50);
  });

  it('honours briefId + limit when given', async () => {
    const client = makeClient({
      listInterviews: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListInterviewsHandler(client);
    await handler({ briefId: 'b1', limit: 10 });
    expect(client.listInterviews).toHaveBeenCalledWith('b1', 10);
  });

  it('serializes date fields as ISO strings in the JSON payload', async () => {
    const client = makeClient({
      listInterviews: vi.fn().mockResolvedValue([
        {
          interviewId: 'i1',
          briefId: 'b1',
          status: 'completed',
          durationSecs: 300,
          overallSentiment: 'positive',
          completedAt: new Date('2026-04-20T12:00:00Z'),
        },
      ]),
    });
    const handler = makeListInterviewsHandler(client);

    const result = await handler({});
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      interviewId: 'i1',
      briefId: 'b1',
      status: 'completed',
      durationSecs: 300,
      overallSentiment: 'positive',
      completedAt: '2026-04-20T12:00:00.000Z',
    });
  });

  it('passes through null completedAt', async () => {
    const client = makeClient({
      listInterviews: vi.fn().mockResolvedValue([
        {
          interviewId: 'i2',
          briefId: 'b1',
          status: 'failed',
          durationSecs: null,
          overallSentiment: null,
          completedAt: null,
        },
      ]),
    });
    const handler = makeListInterviewsHandler(client);

    const result = await handler({});
    const payload = JSON.parse(result.content[0].text);
    expect(payload[0].completedAt).toBeNull();
    expect(payload[0].overallSentiment).toBeNull();
  });

  it('returns a helpful message when no interviews match', async () => {
    const client = makeClient({
      listInterviews: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListInterviewsHandler(client);
    const result = await handler({ briefId: 'b1' });
    expect(result.content[0].text).toMatch(/no interviews/i);
  });
});
