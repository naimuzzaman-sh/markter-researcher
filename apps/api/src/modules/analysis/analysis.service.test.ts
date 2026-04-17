import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from './analysis.service';
import type { TranscriptEntry } from '../../types/call-record.type';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

const testTranscript: TranscriptEntry[] = [
  { role: 'agent', message: 'Hi! Thanks for joining.', timeInCallSecs: 0 },
  { role: 'user', message: 'Hi, happy to be here. I am a product manager at a startup.', timeInCallSecs: 5 },
  { role: 'agent', message: 'What challenges do you face with user research?', timeInCallSecs: 15 },
  { role: 'user', message: 'It takes too long to schedule and conduct interviews.', timeInCallSecs: 25 },
];

const testResearchQuestions = [
  {
    id: 'q1',
    text: 'What is your role?',
    followUp: 'How long have you been doing this?',
    category: 'background' as const,
  },
  {
    id: 'q3',
    text: 'What challenges do you face?',
    followUp: 'How do you work around it?',
    category: 'pain-points' as const,
  },
];

const validAnalysisResponse = {
  participant: {
    inferredRole: 'Product Manager',
    background: 'Works at a startup',
  },
  answers: [
    {
      questionId: 'q1',
      questionText: 'What is your role?',
      response: 'Product manager at a startup',
      sentiment: 'neutral',
    },
  ],
  keyInsights: ['User research is time-consuming for the participant'],
  productMarketFitSignals: ['Strong pain point around scheduling'],
  suggestedFollowUps: ['Ask about budget for research tools'],
  overallSentiment: 'positive',
};

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalysisService('test-gemini-key');
  });

  it('should return a valid CallAnalysis', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validAnalysisResponse),
    });

    const result = await service.analyzeTranscript(testTranscript, testResearchQuestions);
    expect(result.participant.inferredRole).toBe('Product Manager');
    expect(result.overallSentiment).toBe('positive');
  });

  it('should pass transcript content to Gemini', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validAnalysisResponse),
    });

    await service.analyzeTranscript(testTranscript, testResearchQuestions);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('product manager at a startup');
  });

  it('should include research questions in the prompt', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validAnalysisResponse),
    });

    await service.analyzeTranscript(testTranscript, testResearchQuestions);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('What is your role?');
  });

  it('should use gemini-2.5-flash model', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validAnalysisResponse),
    });

    await service.analyzeTranscript(testTranscript, testResearchQuestions);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-2.5-flash');
  });

  it('should throw on invalid Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '{ invalid json }}}',
    });

    await expect(
      service.analyzeTranscript(testTranscript, testResearchQuestions),
    ).rejects.toThrow();
  });

  it('should throw on Gemini response missing required fields', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ participant: { inferredRole: 'PM' } }),
    });

    await expect(
      service.analyzeTranscript(testTranscript, testResearchQuestions),
    ).rejects.toThrow();
  });
});
