import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import { makeGetInterviewHandler } from './get-interview.js';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getInterview: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const sampleAnalysis = {
  participant: { inferredRole: 'PM', background: 'SaaS' },
  answers: [
    {
      questionId: 'q1',
      questionText: 'How do you onboard?',
      response: 'Manually via spreadsheet',
      sentiment: 'neutral' as const,
    },
  ],
  keyInsights: ['Users rely on manual spreadsheets'],
  productMarketFitSignals: ['strong pull'],
  suggestedFollowUps: ['pricing sensitivity'],
  overallSentiment: 'neutral' as const,
};

const sampleTranscript = [
  { role: 'agent' as const, message: 'hi', timeInCallSecs: 0 },
  { role: 'user' as const, message: 'hello', timeInCallSecs: 2 },
];

describe('get_interview tool', () => {
  it('returns a full interview payload when found', async () => {
    const client = makeClient({
      getInterview: vi.fn().mockResolvedValue({
        interviewId: 'i1',
        briefId: 'b1',
        status: 'completed',
        transcript: sampleTranscript,
        analysis: sampleAnalysis,
        durationSecs: 420,
        completedAt: new Date('2026-04-20T09:00:00Z'),
      }),
    });
    const handler = makeGetInterviewHandler(client);

    const result = await handler({ interviewId: 'i1' });
    expect(client.getInterview).toHaveBeenCalledWith('i1');
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toMatchObject({
      interviewId: 'i1',
      briefId: 'b1',
      status: 'completed',
      transcript: sampleTranscript,
      analysis: sampleAnalysis,
      durationSecs: 420,
      completedAt: '2026-04-20T09:00:00.000Z',
    });
  });

  it('passes through null fields (failed interviews may have no analysis/duration)', async () => {
    const client = makeClient({
      getInterview: vi.fn().mockResolvedValue({
        interviewId: 'i2',
        briefId: 'b1',
        status: 'failed',
        transcript: [],
        analysis: null,
        durationSecs: null,
        completedAt: null,
      }),
    });
    const handler = makeGetInterviewHandler(client);

    const payload = JSON.parse(
      (await handler({ interviewId: 'i2' })).content[0].text,
    );
    expect(payload.analysis).toBeNull();
    expect(payload.durationSecs).toBeNull();
    expect(payload.completedAt).toBeNull();
  });

  it('returns a not-found message when the interview is missing', async () => {
    const client = makeClient({
      getInterview: vi.fn().mockResolvedValue(null),
    });
    const handler = makeGetInterviewHandler(client);
    const result = await handler({ interviewId: 'missing' });
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
