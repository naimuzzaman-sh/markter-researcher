import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listBriefsByOwner,
  getBriefById,
  insertBrief,
  updateBriefById,
  appendBriefChat,
} from './briefs';

type QB = {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeClient(
  config: {
    rows?: unknown[];
    row?: unknown;
    rowSequence?: unknown[]; // for multi-call tests (read-then-write)
    error?: { message: string };
  } = {},
) {
  const qb: QB = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  qb.from.mockReturnValue(qb);
  qb.select.mockReturnValue(qb);
  qb.eq.mockReturnValue(qb);
  qb.order.mockReturnValue(qb);
  qb.limit.mockResolvedValue({ data: config.rows ?? [], error: config.error ?? null });
  qb.insert.mockReturnValue(qb);
  qb.update.mockReturnValue(qb);
  if (config.rowSequence) {
    config.rowSequence.forEach((row) =>
      qb.maybeSingle.mockResolvedValueOnce({ data: row, error: null }),
    );
    qb.maybeSingle.mockResolvedValue({ data: null, error: null });
  } else {
    qb.maybeSingle.mockResolvedValue({ data: config.row ?? null, error: config.error ?? null });
  }
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

const fullRow = {
  id: 'b1',
  research_context: sampleContext,
  status: 'active',
  chat_history: [],
  created_at: '2026-04-20T10:00:00Z',
};

describe('listBriefsByOwner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by owner_id and newest first', async () => {
    const client = makeClient({ rows: [fullRow] });
    const rows = await listBriefsByOwner(client, 'u1', 20);
    expect(client.from).toHaveBeenCalledWith('briefs');
    expect(client.eq).toHaveBeenCalledWith('owner_id', 'u1');
    expect(client.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(client.limit).toHaveBeenCalledWith(20);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('b1');
    expect(rows[0].status).toBe('active');
    expect(rows[0].chatHistory).toEqual([]);
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
    const client = makeClient({ row: fullRow });
    const brief = await getBriefById(client, 'b1');
    expect(brief?.id).toBe('b1');
    expect(brief?.researchContext).toEqual(sampleContext);
    expect(brief?.status).toBe('active');
  });

  it('tolerates a partial research_context (draft state)', async () => {
    const draftRow = {
      id: 'b2',
      research_context: { company: { name: 'Co' } }, // partial
      status: 'draft',
      chat_history: [{ role: 'user', content: 'Hi' }],
      created_at: '2026-05-01T10:00:00Z',
    };
    const client = makeClient({ row: draftRow });
    const brief = await getBriefById(client, 'b2');
    expect(brief?.status).toBe('draft');
    expect(brief?.chatHistory).toHaveLength(1);
  });
});

describe('insertBrief', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts as draft by default and returns the new id', async () => {
    const client = makeClient({ row: { id: 'new-id' } });
    const id = await insertBrief(client, { context: sampleContext, ownerId: 'u1' });
    expect(client.insert).toHaveBeenCalledWith({
      research_context: sampleContext,
      owner_id: 'u1',
      status: 'draft',
    });
    expect(id).toBe('new-id');
  });

  it("inserts as active when status='active' is passed", async () => {
    const client = makeClient({ row: { id: 'new-id' } });
    await insertBrief(client, {
      context: sampleContext,
      ownerId: 'u1',
      status: 'active',
    });
    expect(client.insert).toHaveBeenCalledWith({
      research_context: sampleContext,
      owner_id: 'u1',
      status: 'active',
    });
  });

  it('throws if insert returns no id', async () => {
    const client = makeClient({ row: null });
    await expect(
      insertBrief(client, { context: sampleContext, ownerId: 'u1' }),
    ).rejects.toThrow();
  });
});

describe('updateBriefById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates research_context only when context is in patch', async () => {
    const client = makeClient({ row: fullRow });
    await updateBriefById(client, 'b1', 'u1', { context: sampleContext });
    expect(client.update).toHaveBeenCalledWith({ research_context: sampleContext });
  });

  it('updates status only when status is in patch', async () => {
    const client = makeClient({ row: { ...fullRow, status: 'active' } });
    await updateBriefById(client, 'b1', 'u1', { status: 'active' });
    expect(client.update).toHaveBeenCalledWith({ status: 'active' });
  });

  it('updates both when both in patch', async () => {
    const client = makeClient({ row: { ...fullRow, status: 'active' } });
    await updateBriefById(client, 'b1', 'u1', {
      context: sampleContext,
      status: 'active',
    });
    expect(client.update).toHaveBeenCalledWith({
      research_context: sampleContext,
      status: 'active',
    });
  });
});

describe('appendBriefChat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends new messages to existing chat_history under owner gate', async () => {
    const existing = [{ role: 'user', content: 'first' }];
    const client = makeClient({
      rowSequence: [{ chat_history: existing }],
    });
    const len = await appendBriefChat(client, 'b1', 'u1', [
      { role: 'assistant', content: 'response' },
    ]);
    expect(client.update).toHaveBeenCalledWith({
      chat_history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'response' },
      ],
    });
    expect(len).toBe(2);
  });

  it('returns null when brief not found / not owned', async () => {
    const client = makeClient({ rowSequence: [null] });
    const len = await appendBriefChat(client, 'b1', 'u1', [
      { role: 'user', content: 'x' },
    ]);
    expect(len).toBeNull();
    expect(client.update).not.toHaveBeenCalled();
  });

  it('no-ops with empty messages array', async () => {
    const client = makeClient({ row: fullRow });
    const len = await appendBriefChat(client, 'b1', 'u1', []);
    expect(client.update).not.toHaveBeenCalled();
    expect(len).toBe(0);
  });
});
