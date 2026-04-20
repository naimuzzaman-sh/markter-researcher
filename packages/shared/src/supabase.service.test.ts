import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from './supabase.service';
import type { SavedInterview } from './types/saved-interview.type';
import type { ResearchContext } from './types/research-context.type';

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

  describe('refreshSession', () => {
    let refreshSessionMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      refreshSessionMock = vi.fn();
      // Replace the auth shape on the client that vi.mock produced above.
      service = new SupabaseService('https://x.supabase.co', 'k');
      // Reach into the mocked client and swap auth.refreshSession.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).client.auth.refreshSession = refreshSessionMock;
    });

    it('returns the new token pair when Supabase refresh succeeds', async () => {
      refreshSessionMock.mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'new-jwt',
            refresh_token: 'new-refresh',
            expires_at: 1717171717,
            user: { id: 'u1' },
          },
        },
        error: null,
      });

      const result = await service.refreshSession('old-refresh');

      expect(refreshSessionMock).toHaveBeenCalledWith({
        refresh_token: 'old-refresh',
      });
      expect(result).toEqual({
        accessToken: 'new-jwt',
        refreshToken: 'new-refresh',
        expiresAt: 1717171717,
        userId: 'u1',
      });
    });

    it('returns null when refresh fails', async () => {
      refreshSessionMock.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'refresh_token_not_found' },
      });
      const result = await service.refreshSession('bad-refresh');
      expect(result).toBeNull();
    });

    it('returns null when the client throws', async () => {
      refreshSessionMock.mockRejectedValueOnce(new Error('network'));
      const result = await service.refreshSession('anything');
      expect(result).toBeNull();
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

  describe('listBriefsByOwner', () => {
    const OWNER_ID = 'owner-123';

    it('returns the caller\'s briefs newest-first with limit', async () => {
      const limit = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'b1',
            research_context: sampleContext,
            created_at: '2026-04-20T12:00:00Z',
          },
          {
            id: 'b2',
            research_context: sampleContext,
            created_at: '2026-04-19T12:00:00Z',
          },
        ],
        error: null,
      });
      const order = vi.fn().mockReturnValue({ limit });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });
      mockFrom.mockReturnValue({ select });

      const briefs = await service.listBriefsByOwner(OWNER_ID, 10);

      expect(mockFrom).toHaveBeenCalledWith('briefs');
      expect(select).toHaveBeenCalledWith('id, research_context, created_at');
      expect(eq).toHaveBeenCalledWith('owner_id', OWNER_ID);
      expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(limit).toHaveBeenCalledWith(10);
      expect(briefs).toHaveLength(2);
      expect(briefs[0].id).toBe('b1');
      expect(briefs[0].createdAt).toBeInstanceOf(Date);
      expect(briefs[0].researchContext.product.name).toBe('P');
    });

    it('returns an empty array when the owner has no briefs', async () => {
      const limit = vi.fn().mockResolvedValue({ data: [], error: null });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ order: () => ({ limit }) }) }),
      });

      const briefs = await service.listBriefsByOwner(OWNER_ID, 10);
      expect(briefs).toEqual([]);
    });

    it('throws when the query errors', async () => {
      const limit = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'list exploded' },
      });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ order: () => ({ limit }) }) }),
      });

      await expect(service.listBriefsByOwner(OWNER_ID, 10)).rejects.toThrow(
        /list exploded/,
      );
    });
  });

  describe('listInterviews', () => {
    const OWNER_ID = 'owner-123';
    const sampleAnalysis = {
      participant: { inferredRole: 'PM', background: 'SaaS' },
      answers: [],
      keyInsights: ['k'],
      productMarketFitSignals: [],
      suggestedFollowUps: [],
      overallSentiment: 'positive' as const,
    };

    it('returns owner-scoped summaries newest-first with limit (no briefId filter)', async () => {
      const limit = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'i1',
            brief_id: 'b1',
            status: 'completed',
            duration_secs: 300,
            analysis: sampleAnalysis,
            completed_at: '2026-04-20T12:00:00Z',
          },
          {
            id: 'i2',
            brief_id: 'b2',
            status: 'failed',
            duration_secs: null,
            analysis: null,
            completed_at: null,
          },
        ],
        error: null,
      });
      const order = vi.fn().mockReturnValue({ limit });
      const eq = vi.fn().mockReturnValue({ order, eq: vi.fn() });
      const select = vi.fn().mockReturnValue({ eq });
      mockFrom.mockReturnValue({ select });

      const interviews = await service.listInterviews(OWNER_ID, undefined, 25);

      expect(mockFrom).toHaveBeenCalledWith('interviews');
      // Implementation must pull an owner-scoped inner-joined briefs row so the
      // filter can be applied server-side.
      expect(select).toHaveBeenCalledWith(
        expect.stringContaining('briefs!inner'),
      );
      expect(eq).toHaveBeenCalledWith('briefs.owner_id', OWNER_ID);
      expect(order).toHaveBeenCalledWith('completed_at', {
        ascending: false,
        nullsFirst: false,
      });
      expect(limit).toHaveBeenCalledWith(25);
      expect(interviews).toHaveLength(2);

      expect(interviews[0]).toEqual({
        interviewId: 'i1',
        briefId: 'b1',
        status: 'completed',
        durationSecs: 300,
        overallSentiment: 'positive',
        completedAt: expect.any(Date),
      });
      // analysis is null → overallSentiment must be null (no crash)
      expect(interviews[1].overallSentiment).toBeNull();
      expect(interviews[1].completedAt).toBeNull();
      expect(interviews[1].durationSecs).toBeNull();
    });

    it('filters by briefId when provided', async () => {
      const limit = vi.fn().mockResolvedValue({ data: [], error: null });
      const order = vi.fn().mockReturnValue({ limit });
      const eqBrief = vi.fn().mockReturnValue({ order });
      const eqOwner = vi.fn().mockReturnValue({ eq: eqBrief, order });
      const select = vi.fn().mockReturnValue({ eq: eqOwner });
      mockFrom.mockReturnValue({ select });

      await service.listInterviews(OWNER_ID, 'b1', 10);

      expect(eqOwner).toHaveBeenCalledWith('briefs.owner_id', OWNER_ID);
      expect(eqBrief).toHaveBeenCalledWith('brief_id', 'b1');
      expect(limit).toHaveBeenCalledWith(10);
    });

    it('returns an empty array when no interviews match', async () => {
      const limit = vi.fn().mockResolvedValue({ data: [], error: null });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ order: () => ({ limit }) }) }),
      });

      const interviews = await service.listInterviews(OWNER_ID, undefined, 10);
      expect(interviews).toEqual([]);
    });

    it('throws when the query errors', async () => {
      const limit = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'interview list exploded' },
      });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ order: () => ({ limit }) }) }),
      });

      await expect(
        service.listInterviews(OWNER_ID, undefined, 10),
      ).rejects.toThrow(/interview list exploded/);
    });
  });

  describe('getInterviewById', () => {
    const OWNER_ID = 'owner-xyz';
    const INTERVIEW_ID = 'int-1';
    const sampleAnalysis = {
      participant: { inferredRole: 'PM', background: 'SaaS' },
      answers: [],
      keyInsights: ['k'],
      productMarketFitSignals: [],
      suggestedFollowUps: [],
      overallSentiment: 'neutral' as const,
    };
    const sampleTranscript = [
      { role: 'agent' as const, message: 'hi', timeInCallSecs: 0 },
      { role: 'user' as const, message: 'hello', timeInCallSecs: 2 },
    ];

    it('returns the interview detail when the owner owns it', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: INTERVIEW_ID,
          brief_id: 'b1',
          status: 'completed',
          transcript: sampleTranscript,
          analysis: sampleAnalysis,
          duration_secs: 420,
          completed_at: '2026-04-20T09:00:00Z',
        },
        error: null,
      });
      const eqOwner = vi.fn().mockReturnValue({ maybeSingle });
      const eqId = vi.fn().mockReturnValue({ eq: eqOwner });
      const select = vi.fn().mockReturnValue({ eq: eqId });
      mockFrom.mockReturnValue({ select });

      const detail = await service.getInterviewById(INTERVIEW_ID, OWNER_ID);

      expect(mockFrom).toHaveBeenCalledWith('interviews');
      expect(select).toHaveBeenCalledWith(
        expect.stringContaining('briefs!inner'),
      );
      expect(eqId).toHaveBeenCalledWith('id', INTERVIEW_ID);
      expect(eqOwner).toHaveBeenCalledWith('briefs.owner_id', OWNER_ID);

      expect(detail).toEqual({
        interviewId: INTERVIEW_ID,
        briefId: 'b1',
        status: 'completed',
        transcript: sampleTranscript,
        analysis: sampleAnalysis,
        durationSecs: 420,
        completedAt: expect.any(Date),
      });
    });

    it('returns null when the interview does not exist or is not owned', async () => {
      // Supabase .maybeSingle() returns { data: null, error: null } for
      // zero-row results (the inner-join + owner_id filter reduces both
      // "not found" and "not owned" to the same null — don't leak existence).
      const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
      });

      const detail = await service.getInterviewById(INTERVIEW_ID, OWNER_ID);
      expect(detail).toBeNull();
    });

    it('throws when the query errors', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'detail exploded' },
      });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
      });

      await expect(
        service.getInterviewById(INTERVIEW_ID, OWNER_ID),
      ).rejects.toThrow(/detail exploded/);
    });

    it('maps nullable fields (analysis, duration, completed_at) correctly', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: INTERVIEW_ID,
          brief_id: 'b1',
          status: 'failed',
          transcript: [],
          analysis: null,
          duration_secs: null,
          completed_at: null,
        },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
      });

      const detail = await service.getInterviewById(INTERVIEW_ID, OWNER_ID);
      expect(detail).not.toBeNull();
      expect(detail?.analysis).toBeNull();
      expect(detail?.durationSecs).toBeNull();
      expect(detail?.completedAt).toBeNull();
      expect(detail?.status).toBe('failed');
    });
  });
});
