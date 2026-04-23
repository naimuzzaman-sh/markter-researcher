import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExaService } from './exa.service';

describe('ExaService', () => {
  let service: ExaService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    service = new ExaService({ apiKey: 'exa-test' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /search with x-api-key and returns mapped results', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Ada Lovelace',
            url: 'https://linkedin.com/in/ada',
            text: 'Principal Engineer at Analytical Engines',
            author: null,
            score: 0.93,
          },
        ],
      }),
    });

    const results = await service.search({
      query: 'principal engineer analytical engines',
      numResults: 5,
      includeDomains: ['linkedin.com'],
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.exa.ai/search');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('exa-test');
    const body = JSON.parse(init.body);
    expect(body.query).toBe('principal engineer analytical engines');
    expect(body.numResults).toBe(5);
    expect(body.includeDomains).toEqual(['linkedin.com']);

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://linkedin.com/in/ada');
    expect(results[0].score).toBe(0.93);
  });

  it('defaults numResults to 10 when not provided', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await service.search({ query: 'x' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.numResults).toBe(10);
  });

  it('opts into contents.text when includeText is true', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    await service.search({ query: 'x', includeText: true });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.contents).toEqual({ text: true });
  });

  it('throws on non-2xx responses', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'upstream exploded',
    });

    await expect(service.search({ query: 'x' })).rejects.toThrow(
      /EXA search failed: 500/,
    );
  });

  it('returns an empty array when results is missing', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const results = await service.search({ query: 'x' });
    expect(results).toEqual([]);
  });

  it('fills nullable fields when absent', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: 'https://a.example' }],
      }),
    });
    const [r] = await service.search({ query: 'x' });
    expect(r.title).toBeNull();
    expect(r.text).toBeNull();
    expect(r.author).toBeNull();
    expect(r.score).toBeNull();
  });
});
