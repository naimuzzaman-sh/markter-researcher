import { AppError } from '../lib/errors';

/**
 * OpenAI embeddings wrapper. Returns a 1536-dim vector compatible with
 * the `contacts.embedding` pgvector column.
 */

const URL = 'https://api.openai.com/v1/embeddings';
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
