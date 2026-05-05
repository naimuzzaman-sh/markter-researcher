import { AppError } from '../lib/errors';

/**
 * Thin EXA /search wrapper. Used by the discovery flow to find LinkedIn
 * profiles matching a study's target audience.
 */

export type ExaSearchResult = {
  title: string | null;
  url: string;
  text: string | null;
  author: string | null;
  /** Per-query relevant excerpts from the page. Surfaced as "why this match". */
  highlights: string[];
  publishedDate: string | null;
  score: number | null;
};

export type ExaSearchOptions = {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: boolean;
  /**
   * Exa's entity category. `"linkedin profile"` is the right choice for
   * person-based discovery — Exa pre-filters to person profile pages and
   * surfaces structured fields (`author` = the person's name) so we don't
   * have to scrape the title with regexes.
   */
  category?: string;
  /**
   * Live-crawl preference. `'preferred'` = re-crawl when stale, fall back
   * to cache. Trades a little latency for fresher data — important for
   * profiles that update frequently (job changes, headline edits).
   */
  livecrawl?: 'always' | 'preferred' | 'fallback' | 'never' | 'auto';
  /**
   * Per-query relevance excerpts. We pass the study's ICP description as
   * the highlight query so the returned excerpts answer "why does this
   * person match the study" — feeds the candidate-card rationale.
   */
  highlights?: {
    numSentences?: number;
    highlightsPerUrl?: number;
    query?: string;
  };
};

type RawResult = {
  title?: string | null;
  url: string;
  text?: string | null;
  author?: string | null;
  highlights?: string[] | null;
  publishedDate?: string | null;
  score?: number | null;
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
  if (options.category) body.category = options.category;

  // `contents` bundles all per-result extraction options. We compose the
  // object fresh here so callers don't have to know the exact shape.
  const contents: Record<string, unknown> = {};
  if (options.includeText) contents.text = true;
  if (options.highlights) contents.highlights = options.highlights;
  if (options.livecrawl) contents.livecrawl = options.livecrawl;
  if (Object.keys(contents).length > 0) body.contents = contents;

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

  const data = (await res.json()) as { results?: RawResult[] };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? null,
    url: r.url,
    text: r.text ?? null,
    author: r.author ?? null,
    highlights: r.highlights ?? [],
    publishedDate: r.publishedDate ?? null,
    score: r.score ?? null,
  }));
}
