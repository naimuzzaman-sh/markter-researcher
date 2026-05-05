import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';

// All external collaborators are mocked. The tests focus on what
// runDiscovery DOES with their results — name extraction, batched
// calls, count accounting — not on the wire.

vi.mock('../db/studies', () => ({
  getStudyById: vi.fn(),
}));
vi.mock('../db/contacts', () => ({
  bulkUpsertContactsByLinkedIn: vi.fn(),
}));
vi.mock('../db/candidates', () => ({
  insertCandidates: vi.fn(),
}));
vi.mock('../external/exa', () => ({
  exaSearch: vi.fn(),
}));
vi.mock('../external/openai', () => ({
  embedTexts: vi.fn(),
}));

import { runDiscovery } from './_run-discovery';
import { getStudyById } from '../db/studies';
import { bulkUpsertContactsByLinkedIn } from '../db/contacts';
import { insertCandidates } from '../db/candidates';
import { exaSearch } from '../external/exa';
import { embedTexts } from '../external/openai';

const cfg: Config = {
  port: 3001,
  nodeEnv: 'test',
  webOrigins: ['http://localhost:5173'],
  webOrigin: 'http://localhost:5173',
  supabaseUrl: 'x',
  supabaseAnonKey: 'x',
  geminiApiKey: 'x',
  exaApiKey: 'k',
  openaiApiKey: 'oai',
  elevenlabsApiKey: 'x',
  elevenlabsVoiceId: 'x',
  elevenlabsWebhookSecret: 'x',
  resendApiKey: 'x',
  resendFromEmail: 'r@example.com',
  resendWebhookSecret: '',
};

const supabase = {} as SupabaseClient;
const ownerId = 'u1';
const studyId = 'b1';

const baseStudy = {
  id: studyId,
  ownerId,
  researchContext: {
    company: { name: 'Acme', industry: 'fintech', description: '' },
    product: {
      name: 'Acme',
      description: 'Reconciliation tool',
      keyFeatures: [],
      targetAudience: 'Heads of Finance at Series A fintechs',
    },
    research: {
      objective: 'discover ICP',
      questions: [],
      concerns: [],
      productMarketFit: {},
    },
    interviewSettings: { maxDurationMinutes: 30, tone: 'friendly', language: 'en' },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  // Module-level vi.mock keeps the function existence; we reset history
  // and re-prime defaults each test so cases stay independent.
  vi.mocked(getStudyById).mockReset().mockResolvedValue(baseStudy as never);
  vi.mocked(exaSearch).mockReset();
  vi.mocked(embedTexts)
    .mockReset()
    .mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      tokens: 42,
    });
  vi.mocked(bulkUpsertContactsByLinkedIn)
    .mockReset()
    .mockImplementation(async (_c, inputs) => {
      const map = new Map();
      inputs.forEach((input, i) => {
        map.set(input.linkedinUrl, {
          id: `c${i + 1}`,
          ownerId,
          name: input.name,
          linkedinUrl: input.linkedinUrl,
          title: input.title,
          companyName: input.companyName,
          companyDomain: null,
          email: null,
          location: null,
          profileJson: input.profileJson,
          researchNotes: null,
          embedding: input.embedding,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      return map;
    });
  vi.mocked(insertCandidates)
    .mockReset()
    .mockImplementation(async (_c, inputs) => inputs.map((_, i) => `cand${i + 1}`));
});

describe('runDiscovery', () => {
  it('throws not_found when study is missing', async () => {
    vi.mocked(getStudyById).mockResolvedValue(null);
    vi.mocked(exaSearch).mockResolvedValue([]);
    await expect(
      runDiscovery(supabase, cfg, ownerId, { studyId, limit: 5 }),
    ).rejects.toThrow(/Study not found/);
  });

  it('builds an Exa query with category linkedin profile + livecrawl preferred + highlights', async () => {
    vi.mocked(exaSearch).mockResolvedValue([]);
    await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 3 });
    const call = vi.mocked(exaSearch).mock.calls[0];
    expect(call[0]).toBe('k');
    expect(call[1].category).toBe('linkedin profile');
    expect(call[1].livecrawl).toBe('preferred');
    expect(call[1].includeDomains).toEqual(['linkedin.com']);
    expect(call[1].highlights?.numSentences).toBe(2);
    expect(call[1].numResults).toBe(3);
    // Query is composed from the study's full ICP context, not just two tokens.
    expect(call[1].query).toContain('Heads of Finance at Series A fintechs');
    expect(call[1].query).toContain('fintech');
    expect(call[1].query).toContain('Reconciliation tool');
  });

  it('prefers Exa author for the contact name when present', async () => {
    vi.mocked(exaSearch).mockResolvedValue([
      {
        url: 'https://linkedin.com/in/ada',
        title: 'Ada Lovelace - CFO at Acme | LinkedIn',
        text: 'Finance leader',
        author: 'Ada Lovelace',
        highlights: ['Led a 12-person finance team.'],
        publishedDate: null,
        score: 0.9,
      },
    ]);
    await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 1 });
    const upsertCall = vi.mocked(bulkUpsertContactsByLinkedIn).mock.calls[0];
    expect(upsertCall[1][0].name).toBe('Ada Lovelace');
    // Title parser still pulls role + company from the title field.
    expect(upsertCall[1][0].title).toBe('CFO');
    expect(upsertCall[1][0].companyName).toBe('Acme');
  });

  it('falls back to title parser when Exa returns no author', async () => {
    vi.mocked(exaSearch).mockResolvedValue([
      {
        url: 'https://linkedin.com/in/grace',
        title: 'Grace Hopper - VP Engineering at Compilers Inc',
        text: '',
        author: null,
        highlights: [],
        publishedDate: null,
        score: 0.5,
      },
    ]);
    await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 1 });
    const upsertCall = vi.mocked(bulkUpsertContactsByLinkedIn).mock.calls[0];
    expect(upsertCall[1][0].name).toBe('Grace Hopper');
    expect(upsertCall[1][0].companyName).toBe('Compilers Inc');
  });

  it('batches embeddings into a single call regardless of result count', async () => {
    vi.mocked(exaSearch).mockResolvedValue([
      {
        url: 'https://linkedin.com/in/a',
        title: 'A - X at Y',
        text: '',
        author: 'A',
        highlights: [],
        publishedDate: null,
        score: 0.1,
      },
      {
        url: 'https://linkedin.com/in/b',
        title: 'B - X at Z',
        text: '',
        author: 'B',
        highlights: [],
        publishedDate: null,
        score: 0.2,
      },
    ]);
    await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 2 });
    expect(vi.mocked(embedTexts)).toHaveBeenCalledTimes(1);
    const docs = vi.mocked(embedTexts).mock.calls[0][1];
    expect(docs).toHaveLength(2);
  });

  it('counts re-discovered candidates as skipped, not as new', async () => {
    // Simulates: 2 profiles found, but one already exists in
    // study_candidates for this study (Postgres unique constraint
    // skips it). insertCandidates returns 1 id even though we asked
    // to insert 2.
    vi.mocked(exaSearch).mockResolvedValue([
      {
        url: 'https://linkedin.com/in/new',
        title: 'New',
        text: '',
        author: 'New',
        highlights: [],
        publishedDate: null,
        score: 0.5,
      },
      {
        url: 'https://linkedin.com/in/dup',
        title: 'Already-here',
        text: '',
        author: 'Dup',
        highlights: [],
        publishedDate: null,
        score: 0.4,
      },
    ]);
    vi.mocked(embedTexts).mockResolvedValue({
      embeddings: [
        [0.1],
        [0.2],
      ],
      tokens: 2,
    });
    // Only one id comes back from the bulk insert — the other was a
    // (study_id, contact_id) duplicate and got silently dropped.
    vi.mocked(insertCandidates).mockResolvedValue(['cand_new']);

    const out = await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 5 });
    expect(out.candidateCount).toBe(1);
    expect(out.skipped).toBe(1);
  });

  it('skips non-/in/ URLs and reports them in skipped count', async () => {
    vi.mocked(exaSearch).mockResolvedValue([
      {
        url: 'https://linkedin.com/in/ok',
        title: 'OK',
        text: '',
        author: 'OK',
        highlights: [],
        publishedDate: null,
        score: 0.1,
      },
      {
        url: 'https://linkedin.com/company/acme',
        title: 'Acme',
        text: '',
        author: null,
        highlights: [],
        publishedDate: null,
        score: 0.1,
      },
    ]);
    vi.mocked(embedTexts).mockResolvedValue({ embeddings: [[0.1]], tokens: 1 });
    const out = await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 5 });
    expect(out.candidateCount).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.tokensUsed).toBe(1);
  });

  it('returns empty/zero output when no profiles match — does not call embed/upsert/insert', async () => {
    vi.mocked(exaSearch).mockResolvedValue([]);
    const out = await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 5 });
    expect(out).toEqual({
      candidateCount: 0,
      skipped: 0,
      errors: 0,
      errorSamples: [],
      tokensUsed: 0,
    });
    expect(vi.mocked(embedTexts)).not.toHaveBeenCalled();
    expect(vi.mocked(bulkUpsertContactsByLinkedIn)).not.toHaveBeenCalled();
    expect(vi.mocked(insertCandidates)).not.toHaveBeenCalled();
  });

  it('stashes highlights + score on profile_json', async () => {
    vi.mocked(exaSearch).mockResolvedValue([
      {
        url: 'https://linkedin.com/in/ada',
        title: 'Ada - CFO at Acme',
        text: 'snippet',
        author: 'Ada',
        highlights: ['why this match'],
        publishedDate: '2024-09-01',
        score: 0.9,
      },
    ]);
    vi.mocked(embedTexts).mockResolvedValue({ embeddings: [[0.1]], tokens: 1 });
    await runDiscovery(supabase, cfg, ownerId, { studyId, limit: 1 });
    const upsertInputs = vi.mocked(bulkUpsertContactsByLinkedIn).mock.calls[0][1];
    expect(upsertInputs[0].profileJson).toMatchObject({
      highlights: ['why this match'],
      exaScore: 0.9,
      publishedDate: '2024-09-01',
    });
  });
});
