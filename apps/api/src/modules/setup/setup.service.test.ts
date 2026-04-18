import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupService } from './setup.service';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    ARRAY: 'ARRAY',
  },
}));

const sampleContext = {
  company: { name: 'FitPro', industry: 'Fitness', description: 'Fitness app' },
  product: {
    name: 'FitPro',
    description: 'A fitness app for busy professionals',
    keyFeatures: ['Quick workouts'],
    targetAudience: 'Busy professionals 25-45',
  },
  research: {
    objective: 'Validate PMF',
    questions: [
      {
        id: 'q1',
        text: 'Tell me about your fitness routine',
        followUp: 'How often?',
        category: 'background',
      },
    ],
    concerns: [],
    productMarketFit: { hypothesis: 'Need short workouts', signals: [] },
  },
  interviewSettings: { maxDurationMinutes: 5, tone: 'friendly', language: 'en' },
};

describe('SetupService', () => {
  let service: SetupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SetupService('test-gemini-key');
  });

  describe('startSession', () => {
    it('should create a session and return opening message', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          reply: 'Hi! What product would you like to research today?',
          done: false,
        }),
      });

      const result = await service.startSession();

      expect(result.sessionId).toBeTruthy();
      expect(result.firstMessage).toContain('?');
    });

    it('should call Gemini with gemini-2.5-flash and a JSON schema', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({ reply: 'Opening', done: false }),
      });

      await service.startSession();

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
      expect(callArgs.config.responseMimeType).toBe('application/json');
      expect(callArgs.config.responseJsonSchema).toBeDefined();
    });
  });

  describe('sendMessage', () => {
    it('should return reply text for an ongoing session', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({ reply: 'Hi, what are you researching?', done: false }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            reply: 'Great. Who are your target users?',
            done: false,
          }),
        });

      const { sessionId } = await service.startSession();
      const result = await service.sendMessage(sessionId, 'Fitness app');

      expect(result.reply).toContain('target users');
      expect(result.done).toBe(false);
      expect(result.context).toBeUndefined();
    });

    it('should return context when Gemini emits done=true', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({ reply: 'What product?', done: false }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            reply: 'Perfect, launching the interview.',
            done: true,
            context: sampleContext,
          }),
        });

      const { sessionId } = await service.startSession();
      const result = await service.sendMessage(sessionId, 'go');

      expect(result.done).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.product.name).toBe('FitPro');
      expect(result.reply).toContain('launching');
    });

    it('should ignore done=true when context fails validation', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({ reply: 'What product?', done: false }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            reply: 'Starting.',
            done: true,
            context: { company: { name: 'X' } }, // missing required fields
          }),
        });

      const { sessionId } = await service.startSession();
      const result = await service.sendMessage(sessionId, 'go');

      expect(result.done).toBe(false);
      expect(result.context).toBeUndefined();
    });

    it('should handle malformed JSON from Gemini by keeping chat alive', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({ reply: 'What product?', done: false }),
        })
        .mockResolvedValueOnce({ text: 'not json at all' });

      const { sessionId } = await service.startSession();
      const result = await service.sendMessage(sessionId, 'go');

      expect(result.done).toBe(false);
      expect(result.reply).toBeTruthy(); // some fallback text
    });

    it('should throw for unknown session', async () => {
      await expect(
        service.sendMessage('unknown-session', 'hi'),
      ).rejects.toThrow('Session not found');
    });

    it('should accumulate message history across turns', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({ reply: 'Q1?', done: false }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ reply: 'Q2?', done: false }),
        });

      const { sessionId } = await service.startSession();
      await service.sendMessage(sessionId, 'Answer 1');

      const callArgs = mockGenerateContent.mock.calls[1][0];
      const serialized = JSON.stringify(callArgs.contents);
      expect(serialized).toContain('Answer 1');
    });
  });
});
