import { Injectable } from '@nestjs/common';

type OpenAIEmbeddingsConfig = {
  apiKey: string;
  model?: string;
};

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_MODEL = 'text-embedding-3-small'; // 1536 dims

type OpenAIEmbeddingsResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens: number };
};

/**
 * Thin wrapper around OpenAI's embeddings endpoint. Returns a 1536-dim vector
 * compatible with the `contacts.embedding` pgvector column.
 *
 * Single-call shape only: the discovery pipeline embeds one contact at a time.
 * Batch support (`input: string[]`) can be added later if we ever need to
 * re-embed large backfills.
 */
@Injectable()
export class OpenAIEmbeddingsService {
  constructor(private readonly config: OpenAIEmbeddingsConfig) {}

  async embed(text: string): Promise<{ embedding: number[]; tokens: number }> {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI embeddings request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as OpenAIEmbeddingsResponse;
    const first = data.data?.[0];
    if (!first || !Array.isArray(first.embedding)) {
      throw new Error('OpenAI embeddings response missing embedding vector');
    }
    return {
      embedding: first.embedding,
      tokens: data.usage?.total_tokens ?? 0,
    };
  }
}

export type { OpenAIEmbeddingsConfig };
