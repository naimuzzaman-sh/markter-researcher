import { AppError } from '../lib/errors';

/**
 * Thin EXA /search wrapper. Used by the discovery flow to find LinkedIn
 * profiles matching a brief's target audience.
 */

export type ExaSearchResult = {
  title: string | null;
  url: string;
  text: string | null;
  author: string | null;
  score: number | null;
};

export type ExaSearchOptions = {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: boolean;
};

type Response = {
  results: Array<{
    title?: string | null;
    url: string;
    text?: string | null;
    author?: string | null;
    score?: number | null;
  }>;
};

const URL = 'https://api.exa.ai/search';

export async function exaSearch(
  apiKey: string,
  options: ExaSearchOptions,
): Promise<ExaSearchResult[]> {
  const body: Record<string, unknown> = {
    query: options.query,
    numResults: options.numResults ?? 10,
    type: 'neural',
  };
  if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
  if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;
  if (options.includeText) body.contents = { text: true };

  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `EXA search failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
    );
  }

  const data = (await res.json()) as Response;
  return (data.results ?? []).map((r) => ({
    title: r.title ?? null,
    url: r.url,
    text: r.text ?? null,
    author: r.author ?? null,
    score: r.score ?? null,
  }));
}
