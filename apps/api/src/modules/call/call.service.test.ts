import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallService } from './call.service';
import type { AgentFactoryService } from '../agent/agent-factory.service';
import type { AnalysisService } from '../analysis/analysis.service';
import type { SupabaseService } from '../persistence/supabase.service';
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

const mockPersistence: SupabaseService = {
  saveInterview: vi.fn().mockResolvedValue(undefined),
} as unknown as SupabaseService;

const mockFetch = vi.fn();

const mockSignedUrlResponse = {
  ok: true,
  json: async () => ({ signed_url: 'wss://fake.livekit/token=abc' }),
};

describe('CallService', () => {
  let service: CallService;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    service = new CallService(
      mockAgentFactory,
      mockAnalysisService,
      mockPersistence,
      'test-api-key',
    );
  });

  describe('startCall', () => {
    it('should create an agent and return call record', async () => {
      mockFetch.mockResolvedValueOnce(mockSignedUrlResponse);
      const result = await service.startCall(testContext);
      expect(result.agentId).toBe('agent-123');
      expect(result.status).toBe('created');
      expect(result.id).toBeTruthy();
      expect(result.signedUrl).toBe('wss://fake.livekit/token=abc');
    });

    it('should store the call in memory with its context', async () => {
      mockFetch.mockResolvedValueOnce(mockSignedUrlResponse);
      const result = await service.startCall(testContext);
      const stored = service.getCall(result.id);
      expect(stored).toBeDefined();
      expect(stored?.agentId).toBe('agent-123');
      expect(stored?.context).toEqual(testContext);
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
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            transcript: [
              { role: 'agent', message: 'Hello', time_in_call_secs: 0 },
              { role: 'user', message: 'Hi', time_in_call_secs: 5 },
            ],
            status: 'done',
          }),
        });

      const call = await service.startCall(testContext);
      const result = await service.endCall(call.id, 'conv-456');

      expect(result.status).toBe('completed');
      expect(result.analysis).toBeDefined();
      expect(result.transcript.length).toBe(2);
    });

    it('should mark call as failed on error', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockRejectedValueOnce(new Error('Network error'));

      const call = await service.startCall(testContext);
      const result = await service.endCall(call.id, 'conv-456');

      expect(result.status).toBe('failed');
    });

    it('should throw for non-existent call', async () => {
      await expect(service.endCall('fake-id', 'conv-456')).rejects.toThrow('Call not found');
    });

    it('should save the completed interview to Supabase', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            transcript: [{ role: 'agent', message: 'Hi', time_in_call_secs: 0 }],
            status: 'done',
          }),
        });

      const call = await service.startCall(testContext);
      await service.endCall(call.id, 'conv-456');

      expect(mockPersistence.saveInterview).toHaveBeenCalledOnce();
      const saved = (mockPersistence.saveInterview as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.callId).toBe(call.id);
      expect(saved.status).toBe('completed');
      expect(saved.researchContext).toEqual(testContext);
      expect(saved.analysis).toBeDefined();
    });

    it('should save failed interview with null analysis to Supabase', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockRejectedValueOnce(new Error('Network error'));

      const call = await service.startCall(testContext);
      await service.endCall(call.id, 'conv-456');

      expect(mockPersistence.saveInterview).toHaveBeenCalledOnce();
      const saved = (mockPersistence.saveInterview as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.status).toBe('failed');
      expect(saved.analysis).toBeNull();
    });

    it('should not crash if Supabase save fails', async () => {
      mockPersistence.saveInterview = vi.fn().mockRejectedValue(new Error('db down'));
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            transcript: [{ role: 'agent', message: 'Hi', time_in_call_secs: 0 }],
            status: 'done',
          }),
        });

      const call = await service.startCall(testContext);
      const result = await service.endCall(call.id, 'conv-456');

      // Analysis still returned to the caller even if persistence fails
      expect(result.status).toBe('completed');
      expect(result.analysis).toBeDefined();
    });

    it('should delete the ElevenLabs agent after processing', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            transcript: [{ role: 'agent', message: 'Hi', time_in_call_secs: 0 }],
            status: 'done',
          }),
        });

      const call = await service.startCall(testContext);
      await service.endCall(call.id, 'conv-456');

      expect(mockAgentFactory.deleteAgent).toHaveBeenCalledWith('agent-123');
    });
  });
});
