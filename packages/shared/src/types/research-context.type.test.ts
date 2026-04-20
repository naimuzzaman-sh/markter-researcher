import { describe, it, expect } from 'vitest';
import { researchContextSchema } from './research-context.type';

const validContext = {
  company: {
    name: 'Market Researcher AI',
    industry: 'AI / Market Research',
    description: 'An AI-powered agent that conducts market research interviews via voice calls',
  },
  product: {
    name: 'Market Researcher Agent',
    description: 'AI agent that calls users to conduct structured market research interviews',
    keyFeatures: ['Voice interviews', 'Adaptive questioning', 'Post-call analysis'],
    targetAudience: 'Product managers, founders, and market researchers',
  },
  research: {
    objective: 'Understand how potential users currently conduct market research and their interest in an AI-powered solution',
    questions: [
      {
        id: 'q1',
        text: 'What is your role and what kind of products do you work on?',
        followUp: 'How long have you been in this role?',
        category: 'background' as const,
      },
    ],
    concerns: ['Users may not trust AI for qualitative research'],
    productMarketFit: {
      hypothesis: 'Product teams need faster, cheaper qualitative research',
      signals: ['Manual interview scheduling is a pain point'],
    },
  },
  interviewSettings: {
    maxDurationMinutes: 5,
    tone: 'friendly-professional',
    language: 'en',
  },
};

describe('researchContextSchema', () => {
  it('should validate a correct research context', () => {
    const result = researchContextSchema.safeParse(validContext);
    expect(result.success).toBe(true);
  });

  it('should reject missing company name', () => {
    const invalid = {
      ...validContext,
      company: { ...validContext.company, name: '' },
    };
    const result = researchContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject empty questions array', () => {
    const invalid = {
      ...validContext,
      research: { ...validContext.research, questions: [] },
    };
    const result = researchContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid question category', () => {
    const invalid = {
      ...validContext,
      research: {
        ...validContext.research,
        questions: [
          { ...validContext.research.questions[0], category: 'invalid' },
        ],
      },
    };
    const result = researchContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject negative maxDurationMinutes', () => {
    const invalid = {
      ...validContext,
      interviewSettings: { ...validContext.interviewSettings, maxDurationMinutes: -1 },
    };
    const result = researchContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject empty keyFeatures', () => {
    const invalid = {
      ...validContext,
      product: { ...validContext.product, keyFeatures: [] },
    };
    const result = researchContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
