import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupController } from './setup.controller';
import type { SetupService } from './setup.service';

describe('SetupController', () => {
  let controller: SetupController;
  let mockService: SetupService;

  beforeEach(() => {
    mockService = {
      startSession: vi.fn().mockResolvedValue({
        sessionId: 'session-abc',
        firstMessage: 'Hi! What are you researching?',
      }),
      sendMessage: vi.fn().mockResolvedValue({
        reply: 'Got it. Who are the users?',
        done: false,
      }),
    } as unknown as SetupService;

    controller = new SetupController(mockService);
  });

  describe('POST /setup/start', () => {
    it('should return sessionId and firstMessage', async () => {
      const result = await controller.startSession();
      expect(result.sessionId).toBe('session-abc');
      expect(result.firstMessage).toContain('researching');
    });
  });

  describe('POST /setup/chat', () => {
    it('should return reply for valid session', async () => {
      const result = await controller.chat({
        sessionId: 'session-abc',
        message: 'Fitness app',
      });
      expect(result.reply).toContain('users');
      expect(result.done).toBe(false);
    });

    it('should pass context through when session is done', async () => {
      mockService.sendMessage = vi.fn().mockResolvedValue({
        reply: 'Starting now',
        context: { product: { name: 'X' } },
        done: true,
      });

      const result = await controller.chat({
        sessionId: 'session-abc',
        message: 'go',
      });
      expect(result.done).toBe(true);
      expect(result.context).toBeDefined();
    });

    it('should return 404 for unknown session', async () => {
      mockService.sendMessage = vi.fn().mockRejectedValue(new Error('Session not found'));

      await expect(
        controller.chat({ sessionId: 'fake', message: 'hi' }),
      ).rejects.toThrow('Session not found');
    });
  });
});
