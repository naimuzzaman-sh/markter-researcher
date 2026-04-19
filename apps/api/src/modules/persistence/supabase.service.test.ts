import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from './supabase.service';
import type { SavedInterview } from '../../types/saved-interview.type';
import type { ResearchContext } from '../../types/research-context.type';

// Mock builder chain — each call returns `this` until a terminal .single() / .insert() / .maybeSingle() resolves.
const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: {
      getUser: mockAuthGetUser,
    },
  })),
}));

const sampleContext: ResearchContext = {
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
};

const sampleInterview: SavedInterview = {
  callId: 'call-123',
  agentId: 'agent_456',
  briefId: 'b9a7e7e1-8d3a-4f7b-9e4b-25b4e0c3a1f2',
  conversationId: 'conv_789',
  status: 'completed',
  researchContext: sampleContext,
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
    service = new SupabaseService('https://test.supabase.co', 'test-anon-key');
  });

  describe('saveInterview', () => {
    let insertSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      insertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ insert: insertSpy });
    });

    it('should insert into interviews table', async () => {
      await service.saveInterview(sampleInterview);
      expect(mockFrom).toHaveBeenCalledWith('interviews');
      expect(insertSpy).toHaveBeenCalledOnce();
    });

    it('should map camelCase fields to snake_case columns including brief_id', async () => {
      await service.saveInterview(sampleInterview);
      const row = insertSpy.mock.calls[0][0];
      expect(row.call_id).toBe('call-123');
      expect(row.agent_id).toBe('agent_456');
      expect(row.brief_id).toBe('b9a7e7e1-8d3a-4f7b-9e4b-25b4e0c3a1f2');
      expect(row.conversation_id).toBe('conv_789');
      expect(row.research_context).toEqual(sampleInterview.researchContext);
      expect(row.transcript).toEqual(sampleInterview.transcript);
      expect(row.analysis).toEqual(sampleInterview.analysis);
      expect(row.duration_secs).toBe(300);
      expect(row.status).toBe('completed');
    });

    it('should serialize completedAt as ISO string', async () => {
      await service.saveInterview(sampleInterview);
      const row = insertSpy.mock.calls[0][0];
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
      const row = insertSpy.mock.calls[0][0];
      expect(row.status).toBe('failed');
      expect(row.analysis).toBeNull();
      expect(row.completed_at).toBeNull();
      expect(row.duration_secs).toBeNull();
    });

    it('should throw when Supabase returns an error', async () => {
      insertSpy.mockResolvedValueOnce({
        error: { message: 'duplicate key', code: '23505' },
      });
      await expect(service.saveInterview(sampleInterview)).rejects.toThrow(
        /duplicate key/,
      );
    });
  });

  describe('insertBrief', () => {
    const OWNER_ID = 'owner-uuid-123';

    it('should insert into briefs with research_context + owner_id and return the new id', async () => {
      const single = vi.fn().mockResolvedValue({
        data: { id: 'new-brief-uuid' },
        error: null,
      });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      mockFrom.mockReturnValue({ insert });

      const id = await service.insertBrief(sampleContext, OWNER_ID);

      expect(mockFrom).toHaveBeenCalledWith('briefs');
      expect(insert).toHaveBeenCalledWith({
        research_context: sampleContext,
        owner_id: OWNER_ID,
      });
      expect(select).toHaveBeenCalledWith('id');
      expect(id).toBe('new-brief-uuid');
    });

    it('should throw when insert errors', async () => {
      const single = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'boom' },
      });
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => ({ single }) }),
      });

      await expect(service.insertBrief(sampleContext, OWNER_ID)).rejects.toThrow(
        /boom/,
      );
    });
  });

  describe('getBriefById', () => {
    it('should return the brief when found', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'brief-uuid',
          research_context: sampleContext,
          created_at: '2026-04-18T10:00:00Z',
        },
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      mockFrom.mockReturnValue({ select });

      const brief = await service.getBriefById('brief-uuid');

      expect(mockFrom).toHaveBeenCalledWith('briefs');
      expect(eq).toHaveBeenCalledWith('id', 'brief-uuid');
      expect(brief?.id).toBe('brief-uuid');
      expect(brief?.researchContext.product.name).toBe('P');
      expect(brief?.createdAt).toBeInstanceOf(Date);
    });

    it('should return null when brief not found', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle }) }),
      });

      const brief = await service.getBriefById('does-not-exist');
      expect(brief).toBeNull();
    });

    it('should throw when query errors', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'db exploded' },
      });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle }) }),
      });

      await expect(service.getBriefById('id')).rejects.toThrow(/db exploded/);
    });
  });

  describe('getUserFromJwt', () => {
    it('should return the user when the jwt is valid', async () => {
      mockAuthGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-123', email: 'a@b.com' } },
        error: null,
      });

      const user = await service.getUserFromJwt('valid-jwt');

      expect(mockAuthGetUser).toHaveBeenCalledWith('valid-jwt');
      expect(user?.id).toBe('user-123');
      expect(user?.email).toBe('a@b.com');
    });

    it('should return null when Supabase returns an error', async () => {
      mockAuthGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'invalid JWT' },
      });

      const user = await service.getUserFromJwt('bad-jwt');
      expect(user).toBeNull();
    });

    it('should return null when no user in response', async () => {
      mockAuthGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });
      const user = await service.getUserFromJwt('nobody');
      expect(user).toBeNull();
    });

    it('should return null when the Supabase client throws', async () => {
      mockAuthGetUser.mockRejectedValueOnce(new Error('network'));
      const user = await service.getUserFromJwt('anything');
      expect(user).toBeNull();
    });
  });
});
