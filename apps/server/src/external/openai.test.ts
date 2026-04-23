import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedText } from './openai';

const vec = Array.from({ length: 1536 }, () => 0.1);

describe('embedText', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('calls /v1/embeddings with bearer + default model', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: vec, index: 0 }], usage: { total_tokens: 42 } }),
    });
    const result = await embedText('sk', 'hello');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(init.headers.Authorization).toBe('Bearer sk');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.input).toBe('hello');
    expect(result).toEqual({ embedding: vec, tokens: 42 });
  });

  it('honours custom model', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: vec, index: 0 }] }),
    });
    await embedText('sk', 'hi', 'text-embedding-3-large');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).model).toBe('text-embedding-3-large');
  });

  it('throws upstream on non-2xx', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'unauth',
      text: async () => 'bad key',
    });
    await expect(embedText('sk', 'x')).rejects.toThrow(/OpenAI embeddings failed: 401/);
  });

  it('throws when data missing', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await expect(embedText('sk', 'x')).rejects.toThrow(/missing vector/);
  });

  it('defaults tokens to 0 when usage absent', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: vec, index: 0 }] }),
    });
    expect((await embedText('sk', 'x')).tokens).toBe(0);
  });
});
