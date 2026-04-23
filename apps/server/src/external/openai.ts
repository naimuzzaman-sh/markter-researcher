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

export async function embedText(
  apiKey: string,
  text: string,
  model = DEFAULT_MODEL,
): Promise<EmbedResult> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `OpenAI embeddings failed: ${res.status} ${res.statusText}${t ? ` - ${t}` : ''}`,
    );
  }

  const data = (await res.json()) as Response;
  const first = data.data?.[0];
  if (!first || !Array.isArray(first.embedding)) {
    throw new AppError('upstream', 'OpenAI embeddings response missing vector');
  }
  return { embedding: first.embedding, tokens: data.usage?.total_tokens ?? 0 };
}
