import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResearchQuestion, TranscriptEntry } from '@mirrars/shared';

// Mock the OpenAI chat helper. Tests focus on prompt shape, schema
// passing, and post-LLM Zod validation — not on the wire.
vi.mock('../external/openai', () => ({
  chatCompletionJson: vi.fn(),
}));

import { analyzeTranscript } from './analyze-transcript';
import { chatCompletionJson } from '../external/openai';

const transcript: TranscriptEntry[] = [
  { role: 'agent', message: 'Tell me about your role.', timeInCallSecs: 5 },
  {
    role: 'user',
    message: "I'm a PM at a fintech startup, 30 person company.",
    timeInCallSecs: 12,
  },
  {
    role: 'agent',
    message: 'How do you handle expense reconciliation today?',
    timeInCallSecs: 25,
  },
  {
    role: 'user',
    message: 'Spreadsheets. It eats half my Friday every week.',
    timeInCallSecs: 40,
  },
];

const questions: ResearchQuestion[] = [
  {
    id: 'q-bg',
    text: 'Tell me about your role',
    followUp: 'How long?',
    category: 'background',
  },
  {
    id: 'q-pain',
    text: 'How do you handle expense reconciliation today?',
    followUp: 'How long does it take?',
    category: 'pain-points',
  },
];

const validAnalysis = {
  participant: { inferredRole: 'PM', background: 'fintech startup, 30ppl' },
  answers: [
    {
      questionId: 'q-bg',
      questionText: 'Tell me about your role',
      response: 'PM at fintech, 30-person co',
      sentiment: 'neutral',
    },
    {
      questionId: 'q-pain',
      questionText: 'How do you handle expense reconciliation today?',
      response: 'Spreadsheets — eats half a day weekly',
      sentiment: 'negative',
    },
  ],
  keyInsights: [
    'manual reconciliation is a recurring weekly tax',
    'small finance team (no dedicated ops)',
  ],
  productMarketFitSignals: ['"eats half my Friday every week"'],
  suggestedFollowUps: ['Have you evaluated tools to automate this?'],
  overallSentiment: 'negative',
};

beforeEach(() => {
  vi.mocked(chatCompletionJson)
    .mockReset()
    .mockResolvedValue({ data: validAnalysis, tokens: 100 });
});

describe('analyzeTranscript', () => {
  it('returns parsed CallAnalysis on a valid response', async () => {
    const out = await analyzeTranscript('k', transcript, questions);
    expect(out.participant.inferredRole).toBe('PM');
    expect(out.answers).toHaveLength(2);
    expect(out.overallSentiment).toBe('negative');
  });

  it('builds a prompt that lists questions with their ids', async () => {
    await analyzeTranscript('k', transcript, questions);
    const call = vi.mocked(chatCompletionJson).mock.calls[0][0];
    expect(call.prompt).toContain('id="q-bg"');
    expect(call.prompt).toContain('id="q-pain"');
    expect(call.schemaName).toBe('call_analysis');
  });

  it('throws schema error when LLM payload omits required field', async () => {
    // Regression for the prompt/schema mismatch that previously hit
    // production: prompt asked for `answer` + `confidence`, schema
    // wanted `questionId / questionText / response / sentiment`.
    // OpenAI strict mode plus Zod post-validation gates this either
    // server-side or here.
    vi.mocked(chatCompletionJson).mockResolvedValue({
      data: {
        ...validAnalysis,
        answers: [{ questionId: 'q-bg', answer: 'PM', confidence: 0.9 }],
      },
      tokens: 0,
    });
    await expect(
      analyzeTranscript('k', transcript, questions),
    ).rejects.toThrow(/failed schema/);
  });
});
