import { describe, it, expect } from 'vitest';
import { studySchema } from './study.type';

const validStudy = {
  id: 'b9a7e7e1-8d3a-4f7b-9e4b-25b4e0c3a1f2',
  researchContext: {
    company: { name: 'Co', industry: 'SaaS', description: 'desc' },
    product: {
      name: 'P',
      description: 'd',
      keyFeatures: ['a'],
      icp: {
        audience: 'PMs',
        problem: 'manual reporting eats hours',
        attributes: [
          { name: 'role', value: 'PM' },
          { name: 'industry', value: 'SaaS' },
          { name: 'companyStage', value: 'Series A' },
        ],
        summary: 'PMs — PM · SaaS · Series A — manual reporting eats hours',
      },
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
  status: 'active' as const,
  chatHistory: [],
  results: null,
  createdAt: new Date(),
};

describe('studySchema', () => {
  it('validates a correct study', () => {
    const result = studySchema.safeParse(validStudy);
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _id, ...rest } = validStudy;
    void _id;
    const result = studySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid research context shape', () => {
    const invalid = {
      ...validStudy,
      researchContext: { ...validStudy.researchContext, company: { name: '' } },
    };
    const result = studySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID-ish id', () => {
    const result = studySchema.safeParse({ ...validStudy, id: '' });
    expect(result.success).toBe(false);
  });
});
