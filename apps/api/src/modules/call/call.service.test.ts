import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallService } from './call.service';
import type { AgentFactoryService } from '../agent/agent-factory.service';
import type { AnalysisService } from '../analysis/analysis.service';
import type { ResearchContext } from '../../types/research-context.type';

const testContext: ResearchContext = {
  company: { name: 'TestCo', industry: 'SaaS', description: 'Test' },
  product: {
    name: 'TestProduct',
    description: 'Test product',
    keyFeatures: ['A'],
    targetAudience: 'Devs',
  },
  research: {
    objective: 'Test',
    questions: [
      { id: 'q1', text: 'Q?', followUp: 'F?', category: 'background' },
    ],
    concerns: [],
    productMarketFit: { hypothesis: 'H', signals: [] },
  },
  interviewSettings: { maxDurationMinutes: 5, tone: 'friendly', language: 'en' },
};

const mockAgentFactory: AgentFactoryService = {
  createAgent: vi.fn().mockResolvedValue('agent-123'),
  deleteAgent: vi.fn().mockResolvedValue(undefined),
} as unknown as AgentFactoryService;

const mockAnalysisService: AnalysisService = {
  analyzeTranscript: vi.fn().mockResolvedValue({
    participant: { inferredRole: 'PM', background: 'Startup' },
    answers: [],
    keyInsights: ['Insight 1'],
    productMarketFitSignals: [],
    suggestedFollowUps: [],
    overallSentiment: 'positive',
  }),
} as unknown as AnalysisService;

const mockFetch = vi.fn();

describe('CallService', () => {
  let service: CallService;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    service = new CallService(
      mockAgentFactory,
      mockAnalysisService,
      testContext,
      'test-api-key',
    );
  });

  describe('startCall', () => {
    it('should create an agent and return call record', async () => {
      const result = await service.startCall();
      expect(result.agentId).toBe('agent-123');
      expect(result.status).toBe('created');
      expect(result.id).toBeTruthy();
    });

    it('should store the call in memory', async () => {
      const result = await service.startCall();
      const stored = service.getCall(result.id);
      expect(stored).toBeDefined();
      expect(stored?.agentId).toBe('agent-123');
    });
  });

  describe('getCall', () => {
    it('should return null for non-existent call', () => {
      const result = service.getCall('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('endCall', () => {
    it('should fetch transcript and run analysis', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transcript: [
            { role: 'agent', message: 'Hello', time_in_call_secs: 0 },
            { role: 'user', message: 'Hi', time_in_call_secs: 5 },
          ],
          status: 'done',
        }),
      });

      const call = await service.startCall();
      const result = await service.endCall(call.id, 'conv-456');

      expect(result.status).toBe('completed');
      expect(result.analysis).toBeDefined();
      expect(result.transcript.length).toBe(2);
    });

    it('should mark call as failed on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const call = await service.startCall();
      const result = await service.endCall(call.id, 'conv-456');

      expect(result.status).toBe('failed');
    });

    it('should throw for non-existent call', async () => {
      await expect(service.endCall('fake-id', 'conv-456')).rejects.toThrow('Call not found');
    });

    it('should delete the ElevenLabs agent after processing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transcript: [{ role: 'agent', message: 'Hi', time_in_call_secs: 0 }],
          status: 'done',
        }),
      });

      const call = await service.startCall();
      await service.endCall(call.id, 'conv-456');

      expect(mockAgentFactory.deleteAgent).toHaveBeenCalledWith('agent-123');
    });
  });
});
