import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIEmbeddingsService } from './openai-embeddings.service';

const fakeVector = Array.from({ length: 1536 }, () => 0.1);

describe('OpenAIEmbeddingsService', () => {
  let service: OpenAIEmbeddingsService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    service = new OpenAIEmbeddingsService({ apiKey: 'sk-test' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the OpenAI embeddings endpoint with the configured model and bearer auth', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: fakeVector, index: 0 }],
        usage: { total_tokens: 42 },
      }),
    });

    const result = await service.embed('Ada Lovelace, Principal Engineer');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.input).toBe('Ada Lovelace, Principal Engineer');

    expect(result.embedding).toHaveLength(1536);
    expect(result.tokens).toBe(42);
  });

  it('honours a custom model in config', async () => {
    service = new OpenAIEmbeddingsService({
      apiKey: 'sk-test',
      model: 'text-embedding-3-large',
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeVector, index: 0 }] }),
    });

    await service.embed('hello');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.model).toBe('text-embedding-3-large');
  });

  it('throws a descriptive error on non-2xx responses', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid api key',
    });

    await expect(service.embed('hi')).rejects.toThrow(
      /OpenAI embeddings request failed: 401/,
    );
  });

  it('throws when the response is missing an embedding', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await expect(service.embed('hi')).rejects.toThrow(/missing embedding/);
  });

  it('defaults tokens to 0 when usage is not provided', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeVector, index: 0 }] }),
    });
    const result = await service.embed('hi');
    expect(result.tokens).toBe(0);
  });
});
