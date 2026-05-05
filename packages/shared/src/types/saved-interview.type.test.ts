import { describe, it, expect } from 'vitest';
import { savedInterviewSchema } from './saved-interview.type';

const validInterview = {
  callId: 'call-abc',
  agentId: 'agent_xyz',
  studyId: 'b9a7e7e1-8d3a-4f7b-9e4b-25b4e0c3a1f2',
  conversationId: 'conv_123',
  status: 'completed' as const,
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
  transcript: [
    { role: 'agent' as const, message: 'hi', timeInCallSecs: 0 },
  ],
  analysis: {
    participant: { inferredRole: 'PM', background: 'SaaS' },
    answers: [],
    keyInsights: ['insight'],
    productMarketFitSignals: [],
    suggestedFollowUps: [],
    overallSentiment: 'positive' as const,
  },
  durationSecs: 300,
  completedAt: new Date(),
};

describe('savedInterviewSchema', () => {
  it('should validate a completed interview', () => {
    const result = savedInterviewSchema.safeParse(validInterview);
    expect(result.success).toBe(true);
  });

  it('should validate a failed interview with null analysis', () => {
    const result = savedInterviewSchema.safeParse({
      ...validInterview,
      status: 'failed',
      analysis: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid status', () => {
    const result = savedInterviewSchema.safeParse({
      ...validInterview,
      status: 'in-progress',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing callId', () => {
    const rest = { ...validInterview };
    delete (rest as Partial<typeof validInterview>).callId;
    const result = savedInterviewSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should allow null conversationId', () => {
    const result = savedInterviewSchema.safeParse({
      ...validInterview,
      conversationId: null,
    });
    expect(result.success).toBe(true);
  });
});
