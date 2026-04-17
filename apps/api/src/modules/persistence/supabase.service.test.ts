import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from './supabase.service';
import type { SavedInterview } from '../../types/saved-interview.type';

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const sampleInterview: SavedInterview = {
  callId: 'call-123',
  agentId: 'agent_456',
  conversationId: 'conv_789',
  status: 'completed',
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
        { id: 'q1', text: 'Q?', followUp: 'F?', category: 'background' },
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
  transcript: [{ role: 'agent', message: 'hi', timeInCallSecs: 0 }],
  analysis: {
    participant: { inferredRole: 'PM', background: 'SaaS' },
    answers: [],
    keyInsights: ['insight'],
    productMarketFitSignals: [],
    suggestedFollowUps: [],
    overallSentiment: 'positive',
  },
  durationSecs: 300,
  completedAt: new Date('2026-04-12T10:00:00Z'),
};

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    service = new SupabaseService('https://test.supabase.co', 'test-anon-key');
  });

  describe('saveInterview', () => {
    it('should insert into interviews table', async () => {
      await service.saveInterview(sampleInterview);
      expect(mockFrom).toHaveBeenCalledWith('interviews');
      expect(mockInsert).toHaveBeenCalledOnce();
    });

    it('should map camelCase fields to snake_case columns', async () => {
      await service.saveInterview(sampleInterview);
      const row = mockInsert.mock.calls[0][0];
      expect(row.call_id).toBe('call-123');
      expect(row.agent_id).toBe('agent_456');
      expect(row.conversation_id).toBe('conv_789');
      expect(row.research_context).toEqual(sampleInterview.researchContext);
      expect(row.transcript).toEqual(sampleInterview.transcript);
      expect(row.analysis).toEqual(sampleInterview.analysis);
      expect(row.duration_secs).toBe(300);
      expect(row.status).toBe('completed');
    });

    it('should serialize completedAt as ISO string', async () => {
      await service.saveInterview(sampleInterview);
      const row = mockInsert.mock.calls[0][0];
      expect(row.completed_at).toBe('2026-04-12T10:00:00.000Z');
    });

    it('should allow null analysis for failed interview', async () => {
      await service.saveInterview({
        ...sampleInterview,
        status: 'failed',
        analysis: null,
        completedAt: null,
        durationSecs: null,
      });
      const row = mockInsert.mock.calls[0][0];
      expect(row.status).toBe('failed');
      expect(row.analysis).toBeNull();
      expect(row.completed_at).toBeNull();
      expect(row.duration_secs).toBeNull();
    });

    it('should throw when Supabase returns an error', async () => {
      mockInsert.mockResolvedValueOnce({
        error: { message: 'duplicate key', code: '23505' },
      });
      await expect(service.saveInterview(sampleInterview)).rejects.toThrow(/duplicate key/);
    });
  });
});
