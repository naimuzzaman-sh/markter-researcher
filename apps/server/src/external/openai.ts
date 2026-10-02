import { AppError } from '../lib/errors';

/**
 * OpenAI wrappers — embeddings + chat-completions (structured JSON).
 * Plain fetch, no SDK dep.
 */

const URL = 'https://api.openai.com/v1/embeddings';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'text-embedding-3-small';

type Response = {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens: number };
};

export type EmbedResult = { embedding: number[]; tokens: number };
export type EmbedBatchResult = { embeddings: number[][]; tokens: number };

async function callEmbeddings(
  apiKey: string,
  input: string | string[],
  model: string,
): Promise<Response> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `OpenAI embeddings failed: ${res.status} ${res.statusText}${t ? ` - ${t}` : ''}`,
    );
  }

  return (await res.json()) as Response;
}

export async function embedText(
  apiKey: string,
  text: string,
  model = DEFAULT_MODEL,
): Promise<EmbedResult> {
  const data = await callEmbeddings(apiKey, text, model);
  const first = data.data?.[0];
  if (!first || !Array.isArray(first.embedding)) {
    throw new AppError('upstream', 'OpenAI embeddings response missing vector');
  }
  return { embedding: first.embedding, tokens: data.usage?.total_tokens ?? 0 };
}

/**
 * Batched variant: one HTTP call → N embeddings. OpenAI returns each
 * row keyed by `index` so we sort to preserve caller order. Cuts the
 * discovery loop from N round-trips to 1.
 */
export async function embedTexts(
  apiKey: string,
  texts: string[],
  model = DEFAULT_MODEL,
): Promise<EmbedBatchResult> {
  if (texts.length === 0) return { embeddings: [], tokens: 0 };
  const data = await callEmbeddings(apiKey, texts, model);
  const rows = data.data ?? [];
  if (rows.length !== texts.length) {
    throw new AppError(
      'upstream',
      `OpenAI returned ${rows.length} embeddings for ${texts.length} inputs`,
    );
  }
  // OpenAI promises results in input order, but the schema also carries
  // an explicit `index` — sort by that to be defensive against future
  // changes.
  const sorted = [...rows].sort((a, b) => a.index - b.index);
  const embeddings = sorted.map((r, i) => {
    if (!Array.isArray(r.embedding)) {
      throw new AppError('upstream', `OpenAI embedding ${i} missing vector`);
    }
    return r.embedding;
  });
  return { embeddings, tokens: data.usage?.total_tokens ?? 0 };
}

// ───── chat completions (structured JSON) ─────

type ChatResponse = {
  choices: Array<{
    message: { content: string | null };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/**
 * Recursively mark every object node as `additionalProperties: false`
 * and ensure every declared property is in `required` — OpenAI's
 * strict mode (`response_format.json_schema.strict: true`) requires
 * both. Our `zodToJsonSchema` emits `required` only for non-optional
 * fields; for strict OpenAI we treat ALL properties as required (the
 * caller must use Zod unions with null for "may be absent" — strict
 * mode forbids true optionals at the schema level).
 */
export function toStrictJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
      if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
        out.additionalProperties = false;
        out.required = Object.keys(out.properties as Record<string, unknown>);
      }
      return out;
    }
    return node;
  }
  return walk(schema) as Record<string, unknown>;
}

/**
 * Chat-completion with strict JSON-schema output. The model is forced
 * to return exactly the shape — no markdown fences, no field
 * omissions, no shape drift. Replaces the old Gemini path that hit
 * 503s and occasional schema/format quirks.
 *
 * `schemaName` is OpenAI's identifier for the response shape — keeps
 * model errors human-readable when something does go wrong.
 */
export async function chatCompletionJson<T>(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<{ data: T; tokens: number }> {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: 'user', content: opts.prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: opts.schemaName,
          schema: toStrictJsonSchema(opts.schema),
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `OpenAI chat failed: ${res.status} ${res.statusText}${t ? ` - ${t}` : ''}`,
    );
  }
  const body = (await res.json()) as ChatResponse;
  const choice = body.choices?.[0];
  if (!choice) {
    throw new AppError('upstream', 'OpenAI chat returned no choices');
  }
  // `length` finish_reason means truncated output → JSON parse will
  // almost certainly fail. Surface the cause clearly.
  if (choice.finish_reason && choice.finish_reason !== 'stop') {
    throw new AppError(
      'upstream',
      `OpenAI chat ended unexpectedly (${choice.finish_reason}); output may be truncated`,
    );
  }
  const content = choice.message?.content;
  if (!content) {
    throw new AppError('upstream', 'OpenAI chat returned empty content');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError(
      'upstream',
      `OpenAI chat content was not valid JSON: ${content.slice(0, 200)}`,
    );
  }
  return { data: parsed as T, tokens: body.usage?.total_tokens ?? 0 };
}
