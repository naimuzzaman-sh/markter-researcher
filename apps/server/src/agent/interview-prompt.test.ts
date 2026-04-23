import { describe, it, expect } from 'vitest';
import type { ResearchContext } from '@market-researcher/shared';
import { buildInterviewPrompt, buildFirstMessage } from './interview-prompt';

const ctx: ResearchContext = {
  company: { name: 'Acme', industry: 'SaaS', description: 'd' },
  product: {
    name: 'Forms',
    description: 'form builder',
    keyFeatures: ['drag-drop', 'logic'],
    targetAudience: 'PMs',
  },
  research: {
    objective: 'understand onboarding pain',
    questions: [
      { id: 'q1', text: 'Tell me about your role', followUp: 'How long?', category: 'background' },
      { id: 'q2', text: 'What tool do you use today?', followUp: 'Why?', category: 'usage' },
      { id: 'q3', text: 'What frustrates you?', followUp: 'Example?', category: 'pain-points' },
    ],
    concerns: [],
    productMarketFit: { hypothesis: 'h', signals: [] },
  },
  interviewSettings: { maxDurationMinutes: 5, tone: 'friendly', language: 'en' },
};

describe('buildInterviewPrompt', () => {
  it('includes company, product, and objective', () => {
    const p = buildInterviewPrompt(ctx);
    expect(p).toContain('Acme');
    expect(p).toContain('Forms');
    expect(p).toContain('understand onboarding pain');
  });

  it('groups questions by category with labels', () => {
    const p = buildInterviewPrompt(ctx);
    expect(p).toContain('Current Usage & Behavior');
    expect(p).toContain('Pain Points & Challenges');
    expect(p).toContain('Tell me about your role');
    expect(p).toContain('What tool do you use today?');
  });

  it('injects wrap-up minute + duration', () => {
    const p = buildInterviewPrompt(ctx);
    expect(p).toContain('5-minute');
    expect(p).toContain('minutes 2-4');
  });

  it('mentions end_call system tool', () => {
    expect(buildInterviewPrompt(ctx)).toContain('end_call');
  });
});

describe('buildFirstMessage', () => {
  it('greets interviewee with company + duration', () => {
    const m = buildFirstMessage(ctx);
    expect(m).toContain('Acme');
    expect(m).toContain('5 minutes');
  });
});
