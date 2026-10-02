import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exaSearch } from './exa';

describe('exaSearch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs /search with x-api-key + query; maps results', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Ada',
            url: 'https://linkedin.com/in/ada',
            text: 'CFO',
            author: 'Ada Lovelace',
            highlights: ['Led a 12-person finance team.'],
            publishedDate: '2024-09-01',
            score: 0.9,
          },
        ],
      }),
    });

    const results = await exaSearch('k', {
      query: 'cfos',
      numResults: 5,
      includeDomains: ['linkedin.com'],
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.exa.ai/search');
    expect(init.headers['x-api-key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body.query).toBe('cfos');
    expect(body.numResults).toBe(5);
    expect(body.includeDomains).toEqual(['linkedin.com']);
    expect(results).toEqual([
      {
        title: 'Ada',
        url: 'https://linkedin.com/in/ada',
        text: 'CFO',
        author: 'Ada Lovelace',
        highlights: ['Led a 12-person finance team.'],
        publishedDate: '2024-09-01',
        score: 0.9,
      },
    ]);
  });

  it('defaults missing optional result fields to null/empty', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: 'https://linkedin.com/in/x' }],
      }),
    });
    const results = await exaSearch('k', { query: 'x' });
    expect(results).toEqual([
      {
        title: null,
        url: 'https://linkedin.com/in/x',
        text: null,
        author: null,
        highlights: [],
        publishedDate: null,
        score: null,
      },
    ]);
  });

  it('defaults numResults to 10', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    await exaSearch('k', { query: 'x' });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).numResults).toBe(10);
  });

  it('opts into content.text when includeText', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    await exaSearch('k', { query: 'x', includeText: true });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).contents).toEqual({ text: true });
  });

  it('forwards category, highlights, livecrawl', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    await exaSearch('k', {
      query: 'x',
      category: 'linkedin profile',
      livecrawl: 'preferred',
      highlights: { numSentences: 2, highlightsPerUrl: 2, query: 'CFOs' },
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.category).toBe('linkedin profile');
    expect(body.contents).toEqual({
      highlights: { numSentences: 2, highlightsPerUrl: 2, query: 'CFOs' },
      livecrawl: 'preferred',
    });
  });

  it('throws upstream on non-2xx', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'err',
      text: async () => 'boom',
    });
    await expect(exaSearch('k', { query: 'x' })).rejects.toThrow(/EXA search failed: 500/);
  });

  it('returns empty array when results is missing', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await exaSearch('k', { query: 'x' })).toEqual([]);
  });
});
