import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallService } from './call.service';
import type { AgentFactoryService } from '../agent/agent-factory.service';
import type { AnalysisService } from '../analysis/analysis.service';
import type { SupabaseService } from '../persistence/supabase.service';
import type { BriefsService } from '../briefs/briefs.service';
import type { ResearchContext } from '../../types/research-context.type';

const TEST_BRIEF_ID = 'b9a7e7e1-8d3a-4f7b-9e4b-25b4e0c3a1f2';

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

const mockBriefsService: BriefsService = {
  getBrief: vi.fn().mockResolvedValue({
    id: TEST_BRIEF_ID,
    researchContext: testContext,
    createdAt: new Date(),
  }),
} as unknown as BriefsService;

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
    // Re-prime the default mock since clearAllMocks wipes it.
    mockBriefsService.getBrief = vi.fn().mockResolvedValue({
      id: TEST_BRIEF_ID,
      researchContext: testContext,
      createdAt: new Date(),
    });
    mockPersistence.saveInterview = vi.fn().mockResolvedValue(undefined);
    service = new CallService(
      mockAgentFactory,
      mockAnalysisService,
      mockPersistence,
      mockBriefsService,
      'test-api-key',
    );
  });

  describe('startCall', () => {
    it('should create an agent and return call record', async () => {
      mockFetch.mockResolvedValueOnce(mockSignedUrlResponse);
      const result = await service.startCall(TEST_BRIEF_ID);
      expect(result.agentId).toBe('agent-123');
      expect(result.status).toBe('created');
      expect(result.id).toBeTruthy();
      expect(result.signedUrl).toBe('wss://fake.livekit/token=abc');
    });

    it('should store the call in memory with its context and briefId', async () => {
      mockFetch.mockResolvedValueOnce(mockSignedUrlResponse);
      const result = await service.startCall(TEST_BRIEF_ID);
      const stored = service.getCall(result.id);
      expect(stored).toBeDefined();
      expect(stored?.agentId).toBe('agent-123');
      expect(stored?.briefId).toBe(TEST_BRIEF_ID);
      expect(stored?.context).toEqual(testContext);
    });

    it('should throw NotFoundException for unknown briefId', async () => {
      mockBriefsService.getBrief = vi.fn().mockResolvedValue(null);
      await expect(service.startCall('missing-brief-id')).rejects.toThrow(/not found/i);
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

      const call = await service.startCall(TEST_BRIEF_ID);
      const result = await service.endCall(call.id, 'conv-456', { pollIntervalMs: 1, pollMaxAttempts: 3 });

      expect(result.status).toBe('completed');
      expect(result.analysis).toBeDefined();
      expect(result.transcript.length).toBe(2);
    });

    it('should poll until transcript is ready (ElevenLabs needs time to finalize)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        // First poll: conversation is still being processed, empty transcript
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transcript: [], status: 'processing' }),
        })
        // Second poll: processing, still empty
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transcript: [], status: 'processing' }),
        })
        // Third poll: ready with turns
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            transcript: [
              { role: 'agent', message: 'Hi', time_in_call_secs: 0 },
              { role: 'user', message: 'Hey', time_in_call_secs: 2 },
            ],
            status: 'done',
          }),
        });

      const call = await service.startCall(TEST_BRIEF_ID);
      // Pass very short polling delays so the test is fast.
      const result = await service.endCall(call.id, 'conv-456', {
        pollIntervalMs: 1,
        pollMaxAttempts: 10,
      });

      expect(result.status).toBe('completed');
      expect(result.transcript.length).toBe(2);
    });

    it('should mark call as failed when transcript fetch keeps erroring (not a retryable empty)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSignedUrlResponse)
        .mockRejectedValue(new Error('Network error'));

      const call = await service.startCall(TEST_BRIEF_ID);
      const result = await service.endCall(call.id, 'conv-456', {
        pollIntervalMs: 1,
        pollMaxAttempts: 3,
      });

      expect(result.status).toBe('failed');
      // Duration should still be populated on failure so the row is useful.
      expect(result.completedAt).not.toBeNull();
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

      const call = await service.startCall(TEST_BRIEF_ID);
      await service.endCall(call.id, 'conv-456', { pollIntervalMs: 1, pollMaxAttempts: 3 });

      expect(mockPersistence.saveInterview).toHaveBeenCalledOnce();
      const saved = (mockPersistence.saveInterview as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.callId).toBe(call.id);
      expect(saved.briefId).toBe(TEST_BRIEF_ID);
      expect(saved.status).toBe('completed');
      expect(saved.researchContext).toEqual(testContext);
      expect(saved.analysis).toBeDefined();
    });

    it('should save failed interview with null analysis to Supabase', async () => {
      mockFetch.mockResolvedValueOnce(mockSignedUrlResponse);
      // All transcript fetches fail → polling exhausts → call marked failed.
      mockFetch.mockRejectedValue(new Error('Network error'));

      const call = await service.startCall(TEST_BRIEF_ID);
      await service.endCall(call.id, 'conv-456', { pollIntervalMs: 1, pollMaxAttempts: 3 });

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

      const call = await service.startCall(TEST_BRIEF_ID);
      const result = await service.endCall(call.id, 'conv-456', { pollIntervalMs: 1, pollMaxAttempts: 3 });

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

      const call = await service.startCall(TEST_BRIEF_ID);
      await service.endCall(call.id, 'conv-456', { pollIntervalMs: 1, pollMaxAttempts: 3 });

      expect(mockAgentFactory.deleteAgent).toHaveBeenCalledWith('agent-123');
    });
  });
});
