import { Injectable } from '@nestjs/common';

type ExaConfig = {
  apiKey: string;
};

const EXA_SEARCH_URL = 'https://api.exa.ai/search';

export type ExaSearchResult = {
  title: string | null;
  url: string;
  text: string | null;
  author: string | null;
  score: number | null;
};

type ExaSearchResponse = {
  results: Array<{
    title?: string | null;
    url: string;
    text?: string | null;
    author?: string | null;
    score?: number | null;
  }>;
};

type SearchOptions = {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** If true, ask EXA for page text content too (heavier response, richer context). */
  includeText?: boolean;
};

/**
 * Thin wrapper around EXA's /search endpoint. EXA is a neural search engine
 * with strong LinkedIn/bio coverage — the discovery agent uses it to
 * surface interview candidates matching a brief's target audience.
 */
@Injectable()
export class ExaService {
  constructor(private readonly config: ExaConfig) {}

  async search(options: SearchOptions): Promise<ExaSearchResult[]> {
    const body: Record<string, unknown> = {
      query: options.query,
      numResults: options.numResults ?? 10,
      type: 'neural',
    };
    if (options.includeDomains?.length) {
      body.includeDomains = options.includeDomains;
    }
    if (options.excludeDomains?.length) {
      body.excludeDomains = options.excludeDomains;
    }
    if (options.includeText) {
      body.contents = { text: true };
    }

    const response = await fetch(EXA_SEARCH_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `EXA search failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as ExaSearchResponse;
    return (data.results ?? []).map((r) => ({
      title: r.title ?? null,
      url: r.url,
      text: r.text ?? null,
      author: r.author ?? null,
      score: r.score ?? null,
    }));
  }
}

export type { ExaConfig };
