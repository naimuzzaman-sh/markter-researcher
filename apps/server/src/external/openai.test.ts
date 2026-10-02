import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatCompletionJson, embedText, toStrictJsonSchema } from './openai';

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

describe('toStrictJsonSchema', () => {
  it('marks every object with additionalProperties=false and required=all keys', () => {
    const input = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nested: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'string' },
          },
        },
      },
    };
    const out = toStrictJsonSchema(input) as {
      additionalProperties: boolean;
      required: string[];
      properties: { nested: { additionalProperties: boolean; required: string[] } };
    };
    expect(out.additionalProperties).toBe(false);
    expect(out.required).toEqual(['name', 'nested']);
    expect(out.properties.nested.additionalProperties).toBe(false);
    expect(out.properties.nested.required).toEqual(['a', 'b']);
  });

  it('walks through arrays recursively', () => {
    const input = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { x: { type: 'string' } },
          },
        },
      },
    };
    const out = toStrictJsonSchema(input) as {
      properties: {
        items: {
          items: { additionalProperties: boolean; required: string[] };
        };
      };
    };
    expect(out.properties.items.items.additionalProperties).toBe(false);
    expect(out.properties.items.items.required).toEqual(['x']);
  });

  it('leaves leaf scalars alone', () => {
    const input = { type: 'string' };
    const out = toStrictJsonSchema(input) as Record<string, unknown>;
    expect(out).toEqual({ type: 'string' });
  });
});

describe('chatCompletionJson', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts to /v1/chat/completions with strict json_schema response_format', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify({ ok: true }) },
          },
        ],
        usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
      }),
    });
    const result = await chatCompletionJson<{ ok: boolean }>({
      apiKey: 'sk',
      model: 'gpt-4o-mini',
      prompt: 'hi',
      schemaName: 'thing',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('thing');
    // Schema strictification was applied — additionalProperties=false on the root.
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(result).toEqual({ data: { ok: true }, tokens: 50 });
  });

  it('throws upstream on non-2xx', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'rate-limited',
      text: async () => 'slow down',
    });
    await expect(
      chatCompletionJson({
        apiKey: 'sk',
        model: 'gpt-4o-mini',
        prompt: 'x',
        schemaName: 's',
        schema: {},
      }),
    ).rejects.toThrow(/OpenAI chat failed: 429/);
  });

  it('throws when finish_reason is "length" (truncation)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { finish_reason: 'length', message: { content: '{"partial":' } },
        ],
      }),
    });
    await expect(
      chatCompletionJson({
        apiKey: 'sk',
        model: 'gpt-4o-mini',
        prompt: 'x',
        schemaName: 's',
        schema: {},
      }),
    ).rejects.toThrow(/truncated/);
  });

  it('throws when content is empty', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: '' } }],
      }),
    });
    await expect(
      chatCompletionJson({
        apiKey: 'sk',
        model: 'gpt-4o-mini',
        prompt: 'x',
        schemaName: 's',
        schema: {},
      }),
    ).rejects.toThrow(/empty content/);
  });

  it('throws when content is not valid JSON', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: 'not json' } }],
      }),
    });
    await expect(
      chatCompletionJson({
        apiKey: 'sk',
        model: 'gpt-4o-mini',
        prompt: 'x',
        schemaName: 's',
        schema: {},
      }),
    ).rejects.toThrow(/not valid JSON/);
  });
});
