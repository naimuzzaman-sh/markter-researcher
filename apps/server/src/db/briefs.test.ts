import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listBriefsByOwner, getBriefById, insertBrief } from './briefs';

type QB = {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeClient(config: { rows?: unknown[]; row?: unknown; error?: { message: string } } = {}) {
  const qb: QB = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  qb.from.mockReturnValue(qb);
  qb.select.mockReturnValue(qb);
  qb.eq.mockReturnValue(qb);
  qb.order.mockReturnValue(qb);
  qb.limit.mockResolvedValue({ data: config.rows ?? [], error: config.error ?? null });
  qb.insert.mockReturnValue(qb);
  qb.maybeSingle.mockResolvedValue({ data: config.row ?? null, error: config.error ?? null });
  qb.single.mockResolvedValue({ data: config.row ?? null, error: config.error ?? null });
  return qb as never;
}

const sampleContext = {
  company: { name: 'Co', industry: 'SaaS', description: 'd' },
  product: { name: 'P', description: 'd', keyFeatures: ['a'], targetAudience: 't' },
  research: {
    objective: 'o',
    questions: [{ id: 'q1', text: 'Q?', followUp: 'F', category: 'background' as const }],
    concerns: [],
    productMarketFit: { hypothesis: 'h', signals: [] },
  },
  interviewSettings: { maxDurationMinutes: 5, tone: 'friendly', language: 'en' },
};

describe('listBriefsByOwner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by owner_id and newest first', async () => {
    const client = makeClient({
      rows: [{ id: 'b1', research_context: sampleContext, created_at: '2026-04-20T10:00:00Z' }],
    });
    const rows = await listBriefsByOwner(client, 'u1', 20);
    expect(client.from).toHaveBeenCalledWith('briefs');
    expect(client.eq).toHaveBeenCalledWith('owner_id', 'u1');
    expect(client.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(client.limit).toHaveBeenCalledWith(20);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('b1');
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it('throws on Supabase error', async () => {
    const client = makeClient({ error: { message: 'db down' } });
    await expect(listBriefsByOwner(client, 'u1', 20)).rejects.toThrow(/db down/);
  });
});

describe('getBriefById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no row found', async () => {
    const client = makeClient({ row: null });
    expect(await getBriefById(client, 'nope')).toBeNull();
  });

  it('returns the brief row mapped', async () => {
    const client = makeClient({
      row: { id: 'b1', research_context: sampleContext, created_at: '2026-04-20T10:00:00Z' },
    });
    const brief = await getBriefById(client, 'b1');
    expect(brief?.id).toBe('b1');
    expect(brief?.researchContext).toEqual(sampleContext);
  });
});

describe('insertBrief', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts and returns the new id', async () => {
    const client = makeClient({ row: { id: 'new-id' } });
    const id = await insertBrief(client, sampleContext, 'u1');
    expect(client.insert).toHaveBeenCalledWith({
      research_context: sampleContext,
      owner_id: 'u1',
    });
    expect(id).toBe('new-id');
  });

  it('throws if insert returns no id', async () => {
    const client = makeClient({ row: null });
    await expect(insertBrief(client, sampleContext, 'u1')).rejects.toThrow();
  });
});
