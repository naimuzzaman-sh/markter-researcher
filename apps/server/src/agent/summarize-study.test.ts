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

vi.mock('../db/studies', () => ({
  getStudyById: vi.fn(),
  updateStudyResults: vi.fn(),
}));

vi.mock('../db/interviews', () => ({
  listCompletedInterviewsForStudySummarization: vi.fn(),
}));

import { summarizeStudy } from './summarize-study';
import { getStudyById, updateStudyResults } from '../db/studies';
import { listCompletedInterviewsForStudySummarization } from '../db/interviews';

const supabase = {} as SupabaseClient;
const studyId = 'b1';

const baseStudy = {
  id: studyId,
  researchContext: {
    company: { name: 'Acme', industry: 'fintech', description: 'd' },
    product: {
      name: 'Acme Pay',
      description: 'd',
      keyFeatures: ['x'],
      icp: {
        audience: 'SMB owners',
        problem: 'manual reconciliation eats hours',
        attributes: [
          { name: 'role', value: 'owner' },
          { name: 'companySize', value: '1-50' },
          { name: 'industry', value: 'retail' },
        ],
        summary: 'SMB owners — owner · 1-50 · retail — manual reconciliation eats hours',
      },
    },
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
  vi.mocked(getStudyById).mockReset().mockResolvedValue(baseStudy as never);
  vi.mocked(listCompletedInterviewsForStudySummarization)
    .mockReset()
    .mockResolvedValue([baseInterview] as never);
  vi.mocked(updateStudyResults).mockReset().mockResolvedValue(true);
  generateContent.mockReset();
  generateContent.mockResolvedValue({
    text: JSON.stringify(validResultsPayload),
    candidates: [],
  });
});

describe('summarizeStudy', () => {
  it('returns null when study does not exist', async () => {
    vi.mocked(getStudyById).mockResolvedValue(null);
    const result = await summarizeStudy({
      apiKey: 'k',
      supabase,
      studyId,
    });
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
    expect(vi.mocked(updateStudyResults)).not.toHaveBeenCalled();
  });

  it('returns null and writes nothing when there are zero completed interviews', async () => {
    vi.mocked(listCompletedInterviewsForStudySummarization).mockResolvedValue([]);
    const result = await summarizeStudy({
      apiKey: 'k',
      supabase,
      studyId,
    });
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
    expect(vi.mocked(updateStudyResults)).not.toHaveBeenCalled();
  });

  it('stamps interviewCount + lastUpdated server-side (not from the LLM)', async () => {
    vi.mocked(listCompletedInterviewsForStudySummarization).mockResolvedValue([
      baseInterview,
      { ...baseInterview, interviewId: 'iv2' },
      { ...baseInterview, interviewId: 'iv3' },
    ] as never);
    // LLM returns the wrong count on purpose — we must override.
    generateContent.mockResolvedValue({
      text: JSON.stringify({ ...validResultsPayload, interviewCount: 99, lastUpdated: 'fake' }),
    });
    const before = Date.now();
    const result = await summarizeStudy({ apiKey: 'k', supabase, studyId });
    const after = Date.now();
    expect(result?.interviewCount).toBe(3);
    const updated = new Date(result!.lastUpdated).getTime();
    expect(updated).toBeGreaterThanOrEqual(before);
    expect(updated).toBeLessThanOrEqual(after);
  });

  it('persists the validated result via updateStudyResults', async () => {
    const result = await summarizeStudy({ apiKey: 'k', supabase, studyId });
    expect(result).not.toBeNull();
    expect(vi.mocked(updateStudyResults)).toHaveBeenCalledWith(
      supabase,
      studyId,
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
      summarizeStudy({ apiKey: 'k', supabase, studyId }),
    ).rejects.toThrow(/not valid JSON/);
    expect(vi.mocked(updateStudyResults)).not.toHaveBeenCalled();
  });

  it('throws when JSON fails the schema (missing required field)', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ summary: 'ok' }), // missing themes/painPoints/etc
    });
    await expect(
      summarizeStudy({ apiKey: 'k', supabase, studyId }),
    ).rejects.toThrow(/failed schema/);
    expect(vi.mocked(updateStudyResults)).not.toHaveBeenCalled();
  });

  it('throws when Gemini response is empty', async () => {
    generateContent.mockResolvedValue({ text: '' });
    await expect(
      summarizeStudy({ apiKey: 'k', supabase, studyId }),
    ).rejects.toThrow(/empty response/);
  });
});
