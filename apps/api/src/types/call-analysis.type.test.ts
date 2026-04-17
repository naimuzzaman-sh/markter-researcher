import { describe, it, expect } from 'vitest';
import { callAnalysisSchema } from './call-analysis.type';

const validAnalysis = {
  participant: {
    inferredRole: 'Product Manager',
    background: 'Works at a SaaS startup, manages a team of 5',
  },
  answers: [
    {
      questionId: 'q1',
      questionText: 'What is your role?',
      response: 'I am a product manager at a B2B SaaS company',
      sentiment: 'neutral' as const,
    },
  ],
  keyInsights: ['User currently relies on manual interviews'],
  productMarketFitSignals: ['Strong interest in automation'],
  suggestedFollowUps: ['Ask about budget for research tools'],
  overallSentiment: 'positive' as const,
};

describe('callAnalysisSchema', () => {
  it('should validate a correct analysis', () => {
    const result = callAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it('should reject missing participant role', () => {
    const invalid = {
      ...validAnalysis,
      participant: { ...validAnalysis.participant, inferredRole: '' },
    };
    const result = callAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid sentiment', () => {
    const invalid = {
      ...validAnalysis,
      overallSentiment: 'angry',
    };
    const result = callAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should allow empty productMarketFitSignals', () => {
    const withEmpty = {
      ...validAnalysis,
      productMarketFitSignals: [],
    };
    const result = callAnalysisSchema.safeParse(withEmpty);
    expect(result.success).toBe(true);
  });

  it('should reject answer with empty response', () => {
    const invalid = {
      ...validAnalysis,
      answers: [{ ...validAnalysis.answers[0], response: '' }],
    };
    const result = callAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
