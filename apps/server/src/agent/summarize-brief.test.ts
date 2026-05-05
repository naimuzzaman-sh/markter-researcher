import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock all collaborators. The tests focus on the orchestration logic:
// "do we call Gemini?", "what's stamped on the result?", "do we
// short-circuit when there are zero interviews?", etc.
const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
}));

vi.mock('../db/briefs', () => ({
  getBriefById: vi.fn(),
  updateBriefResults: vi.fn(),
}));

vi.mock('../db/interviews', () => ({
  listCompletedInterviewsForBriefSummarization: vi.fn(),
}));

import { summarizeBrief } from './summarize-brief';
import { getBriefById, updateBriefResults } from '../db/briefs';
import { listCompletedInterviewsForBriefSummarization } from '../db/interviews';

const supabase = {} as SupabaseClient;
const briefId = 'b1';

const baseBrief = {
  id: briefId,
  researchContext: {
    company: { name: 'Acme', industry: 'fintech', description: 'd' },
    product: { name: 'Acme Pay', description: 'd', keyFeatures: ['x'], targetAudience: 'SMBs' },
    research: {
      objective: 'Validate PMF',
      questions: [],
      concerns: [],
      productMarketFit: { hypothesis: 'h', signals: [] },
    },
    interviewSettings: { maxDurationMinutes: 30, tone: 'friendly', language: 'en' },
  },
  status: 'active' as const,
  chatHistory: [],
  results: null,
  createdAt: new Date(),
};

const baseInterview = {
  interviewId: 'iv1',
  transcript: [
    { role: 'agent' as const, message: 'How do you handle expenses?', timeInCallSecs: 5 },
    {
      role: 'user' as const,
      message: 'Manually with spreadsheets, it sucks',
      timeInCallSecs: 10,
    },
  ],
  analysis: {
    keyInsights: ['users hate manual entry'],
    productMarketFitSignals: ['strong pain around manual work'],
  },
  completedAt: new Date(),
};

const validResultsPayload = {
  summary: 'Users universally dislike manual expense entry.',
  themes: ['Manual entry friction'],
  painPoints: ['Spreadsheet drudgery'],
  pmfSignalsObserved: ['Strong frustration signals'],
  recommendations: ['Validate auto-import flow'],
};

beforeEach(() => {
  vi.mocked(getBriefById).mockReset().mockResolvedValue(baseBrief as never);
  vi.mocked(listCompletedInterviewsForBriefSummarization)
    .mockReset()
    .mockResolvedValue([baseInterview] as never);
  vi.mocked(updateBriefResults).mockReset().mockResolvedValue(true);
  generateContent.mockReset();
  generateContent.mockResolvedValue({
    text: JSON.stringify(validResultsPayload),
    candidates: [],
  });
});

describe('summarizeBrief', () => {
  it('returns null when brief does not exist', async () => {
    vi.mocked(getBriefById).mockResolvedValue(null);
    const result = await summarizeBrief({
      apiKey: 'k',
      supabase,
      briefId,
    });
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
    expect(vi.mocked(updateBriefResults)).not.toHaveBeenCalled();
  });

  it('returns null and writes nothing when there are zero completed interviews', async () => {
    vi.mocked(listCompletedInterviewsForBriefSummarization).mockResolvedValue([]);
    const result = await summarizeBrief({
      apiKey: 'k',
      supabase,
      briefId,
    });
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
    expect(vi.mocked(updateBriefResults)).not.toHaveBeenCalled();
  });

  it('stamps interviewCount + lastUpdated server-side (not from the LLM)', async () => {
    vi.mocked(listCompletedInterviewsForBriefSummarization).mockResolvedValue([
      baseInterview,
      { ...baseInterview, interviewId: 'iv2' },
      { ...baseInterview, interviewId: 'iv3' },
    ] as never);
    // LLM returns the wrong count on purpose — we must override.
    generateContent.mockResolvedValue({
      text: JSON.stringify({ ...validResultsPayload, interviewCount: 99, lastUpdated: 'fake' }),
    });
    const before = Date.now();
    const result = await summarizeBrief({ apiKey: 'k', supabase, briefId });
    const after = Date.now();
    expect(result?.interviewCount).toBe(3);
    const updated = new Date(result!.lastUpdated).getTime();
    expect(updated).toBeGreaterThanOrEqual(before);
    expect(updated).toBeLessThanOrEqual(after);
  });

  it('persists the validated result via updateBriefResults', async () => {
    const result = await summarizeBrief({ apiKey: 'k', supabase, briefId });
    expect(result).not.toBeNull();
    expect(vi.mocked(updateBriefResults)).toHaveBeenCalledWith(
      supabase,
      briefId,
      expect.objectContaining({
        summary: validResultsPayload.summary,
        themes: validResultsPayload.themes,
        interviewCount: 1,
      }),
    );
  });

  it('throws when Gemini returns invalid JSON', async () => {
    generateContent.mockResolvedValue({ text: 'not json {{{' });
    await expect(
      summarizeBrief({ apiKey: 'k', supabase, briefId }),
    ).rejects.toThrow(/not valid JSON/);
    expect(vi.mocked(updateBriefResults)).not.toHaveBeenCalled();
  });

  it('throws when JSON fails the schema (missing required field)', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ summary: 'ok' }), // missing themes/painPoints/etc
    });
    await expect(
      summarizeBrief({ apiKey: 'k', supabase, briefId }),
    ).rejects.toThrow(/failed schema/);
    expect(vi.mocked(updateBriefResults)).not.toHaveBeenCalled();
  });

  it('throws when Gemini response is empty', async () => {
    generateContent.mockResolvedValue({ text: '' });
    await expect(
      summarizeBrief({ apiKey: 'k', supabase, briefId }),
    ).rejects.toThrow(/empty response/);
  });
});
