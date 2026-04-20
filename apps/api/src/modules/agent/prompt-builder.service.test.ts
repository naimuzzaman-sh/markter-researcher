import { describe, it, expect } from 'vitest';
import { PromptBuilderService } from './prompt-builder.service';
import type { ResearchContext } from '@market-researcher/shared';

const testContext: ResearchContext = {
  company: {
    name: 'TestCo',
    industry: 'SaaS',
    description: 'A test company',
  },
  product: {
    name: 'TestProduct',
    description: 'A test product for market research',
    keyFeatures: ['Feature A', 'Feature B'],
    targetAudience: 'Developers',
  },
  research: {
    objective: 'Understand user needs',
    questions: [
      {
        id: 'q1',
        text: 'What is your role?',
        followUp: 'How long have you been doing this?',
        category: 'background',
      },
      {
        id: 'q2',
        text: 'What tools do you use?',
        followUp: 'What do you like about them?',
        category: 'usage',
      },
      {
        id: 'q3',
        text: 'What frustrates you?',
        followUp: 'How do you work around it?',
        category: 'pain-points',
      },
    ],
    concerns: ['Users might not trust AI'],
    productMarketFit: {
      hypothesis: 'Users need faster research',
      signals: ['Manual process is slow'],
    },
  },
  interviewSettings: {
    maxDurationMinutes: 5,
    tone: 'friendly-professional',
    language: 'en',
  },
};

describe('PromptBuilderService', () => {
  const service = new PromptBuilderService();

  it('should return a non-empty string', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe('string');
  });

  it('should include the product name and description', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toContain('TestProduct');
    expect(prompt).toContain('A test product for market research');
  });

  it('should include the company name', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toContain('TestCo');
  });

  it('should include all research questions', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toContain('What is your role?');
    expect(prompt).toContain('What tools do you use?');
    expect(prompt).toContain('What frustrates you?');
  });

  it('should include follow-up questions', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toContain('How long have you been doing this?');
  });

  it('should include time management instructions', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toContain('5');
    expect(prompt.toLowerCase()).toContain('minute');
  });

  it('should include tone guidance', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt.toLowerCase()).toContain('friendly');
  });

  it('should include the research objective', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt).toContain('Understand user needs');
  });

  it('should include background question instructions', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt.toLowerCase()).toContain('background');
  });

  it('should include closing protocol', () => {
    const prompt = service.buildInterviewPrompt(testContext);
    expect(prompt.toLowerCase()).toContain('thank');
  });
});
