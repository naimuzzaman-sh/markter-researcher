import { describe, it, expect } from 'vitest';
import { briefSchema } from './brief.type';

const validBrief = {
  id: 'b9a7e7e1-8d3a-4f7b-9e4b-25b4e0c3a1f2',
  researchContext: {
    company: { name: 'Co', industry: 'SaaS', description: 'desc' },
    product: {
      name: 'P',
      description: 'd',
      keyFeatures: ['a'],
      targetAudience: 'ta',
    },
    research: {
      objective: 'obj',
      questions: [
        { id: 'q1', text: 'Q?', followUp: 'F?', category: 'background' as const },
      ],
      concerns: [],
      productMarketFit: { hypothesis: 'h', signals: [] },
    },
    interviewSettings: {
      maxDurationMinutes: 5,
      tone: 'friendly',
      language: 'en',
    },
  },
  createdAt: new Date(),
};

describe('briefSchema', () => {
  it('validates a correct brief', () => {
    const result = briefSchema.safeParse(validBrief);
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _id, ...rest } = validBrief;
    void _id;
    const result = briefSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid research context shape', () => {
    const invalid = {
      ...validBrief,
      researchContext: { ...validBrief.researchContext, company: { name: '' } },
    };
    const result = briefSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID-ish id', () => {
    const result = briefSchema.safeParse({ ...validBrief, id: '' });
    expect(result.success).toBe(false);
  });
});
