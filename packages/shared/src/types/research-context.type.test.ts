import { describe, it, expect } from 'vitest';
import { studyPatchSchema, researchContextSchema } from './research-context.type';

const validContext = {
  company: {
    name: 'Mirrars',
    industry: 'AI / Market Research',
    description: 'An AI-powered agent that conducts market research interviews via voice calls',
  },
  product: {
    name: 'Mirrars Agent',
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

describe('studyPatchSchema', () => {
  it('accepts an empty patch (no-op update)', () => {
    expect(studyPatchSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single nested field patch (research.objective only)', () => {
    expect(
      studyPatchSchema.safeParse({ research: { objective: 'new goal' } })
        .success,
    ).toBe(true);
  });

  it('accepts a multi-subtree patch touching product + interviewSettings', () => {
    expect(
      studyPatchSchema.safeParse({
        product: { name: 'New Name' },
        interviewSettings: { maxDurationMinutes: 10 },
      }).success,
    ).toBe(true);
  });

  it('accepts replacing the questions array wholesale when complete items are provided', () => {
    const result = studyPatchSchema.safeParse({
      research: {
        questions: [
          {
            id: 'qz',
            text: 'Z?',
            followUp: 'ZF?',
            category: 'usage',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty strings on fields that have minLength:1 (e.g. objective)', () => {
    expect(
      studyPatchSchema.safeParse({ research: { objective: '' } }).success,
    ).toBe(false);
  });

  it('rejects incomplete question objects in the questions array', () => {
    // Array items must be FULL questions — per-item partials are not supported.
    const result = studyPatchSchema.safeParse({
      research: {
        questions: [{ id: 'qx', text: 'partial only' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys via the object schema', () => {
    const result = studyPatchSchema.safeParse({
      company: { name: 'X' },
      bogus: 'not a real field',
    });
    // Zod objects are strict-off by default — they accept but strip unknown
    // keys. Assert the parsed shape has no bogus field leaking through.
    expect(result.success).toBe(true);
    if (result.success) {
      expect('bogus' in result.data).toBe(false);
    }
  });
});
