import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupService } from './setup.service';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

describe('SetupService', () => {
  let service: SetupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SetupService('test-gemini-key');
  });

  describe('startSession', () => {
    it('should create a session and return opening message', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Hi! What product would you like to research today?',
      });

      const result = await service.startSession();

      expect(result.sessionId).toBeTruthy();
      expect(result.firstMessage).toContain('?');
    });

    it('should call Gemini with gemini-2.5-flash model', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Opening question',
      });

      await service.startSession();

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
    });
  });

  describe('sendMessage', () => {
    it('should return an assistant reply for an ongoing session', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'Hi, what are you researching?' })
        .mockResolvedValueOnce({ text: 'Great. Who are your target users?' });

      const { sessionId } = await service.startSession();
      const result = await service.sendMessage(sessionId, 'Fitness app for busy professionals');

      expect(result.reply).toContain('target users');
      expect(result.done).toBe(false);
      expect(result.context).toBeUndefined();
    });

    it('should detect completion and emit ResearchContext when Gemini signals DONE', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'What product?' })
        .mockResolvedValueOnce({
          text: `Great, I have enough to start!\n<<<CONTEXT>>>${JSON.stringify({
            company: { name: 'FitPro', industry: 'Fitness', description: 'Fitness app for busy professionals' },
            product: {
              name: 'FitPro',
              description: 'A fitness app for busy professionals',
              keyFeatures: ['Quick workouts', 'Smart scheduling'],
              targetAudience: 'Busy professionals aged 25-45',
            },
            research: {
              objective: 'Validate PMF for the fitness app',
              questions: [
                { id: 'q1', text: 'Tell me about your fitness routine', followUp: 'How often?', category: 'background' },
              ],
              concerns: ['Users may not have time'],
              productMarketFit: {
                hypothesis: 'Busy pros need short, effective workouts',
                signals: ['High demand for short workouts'],
              },
            },
            interviewSettings: { maxDurationMinutes: 5, tone: 'friendly', language: 'en' },
          })}<<<END>>>`,
        });

      const { sessionId } = await service.startSession();
      const result = await service.sendMessage(sessionId, 'Fitness app for busy professionals');

      expect(result.done).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.product.name).toBe('FitPro');
    });

    it('should throw for unknown session', async () => {
      await expect(service.sendMessage('unknown-session', 'hi')).rejects.toThrow('Session not found');
    });

    it('should accumulate message history across turns', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'Q1?' })
        .mockResolvedValueOnce({ text: 'Q2?' });

      const { sessionId } = await service.startSession();
      await service.sendMessage(sessionId, 'Answer 1');

      const callArgs = mockGenerateContent.mock.calls[1][0];
      const contents = Array.isArray(callArgs.contents) ? callArgs.contents : [callArgs.contents];
      const serialized = JSON.stringify(contents);
      expect(serialized).toContain('Answer 1');
    });
  });
});
