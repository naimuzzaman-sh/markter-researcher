/**
 * Discovery orchestration helper — not a tool itself. Runs inside the
 * background execution of a `find_candidates` job.
 *
 * Flow:
 *   1. Load study by id (ownership already verified at enqueue time)
 *   2. Build a search query from the study's research context
 *   3. EXA `category: 'linkedin profile'` + highlights query = relevant
 *      person profiles + per-result "why-this-match" excerpts
 *   4. Prefer Exa's structured `author` for the contact name; fall back
 *      to the legacy title regex (and finally the URL slug) when missing
 *   5. Batch-embed all profile docs in a single OpenAI call
 *   6. Bulk-upsert contacts, then bulk-insert study_candidate rows
 *   7. Return summary { candidateCount, skipped, errors, errorSamples, tokens }
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import { getStudyById } from '../db/studies';
import { bulkUpsertContactsByLinkedIn } from '../db/contacts';
import { insertCandidates } from '../db/candidates';
import { exaSearch, type ExaSearchResult } from '../external/exa';
import { embedTexts } from '../external/openai';
import { AppError } from '../lib/errors';

type DiscoveryInput = {
  studyId: string;
  limit: number;
  extraCriteria?: string;
};

export type DiscoveryOutput = {
  candidateCount: number;
  skipped: number;
  errors: number;
  errorSamples: string[];
  tokensUsed: number;
};

const MAX_ERRORS_CAPTURED = 5;

type Parsed = { name: string; title: string | null; companyName: string | null };

/**
 * Title-parsing fallback used when Exa doesn't return a structured
 * `author`. With `category: 'linkedin profile'`, Exa's `author` is the
 * person's display name in most cases, so this is the unhappy path.
 *
 * Heuristics, ordered by reliability:
 *   1. Title is missing → derive a rough name from the URL slug.
 *   2. Standard LinkedIn dash-format: `"Name - Title at Company"`.
 *   3. Pipe-separated headline: `"Name | Empower PMs | Forbes | …"` —
 *      first segment is the name, then any later segment matching
 *      `"… at <Company>"` or `"… @ <Company>"` becomes title + company.
 *      Without that, the second segment is treated as a free-form title.
 *   4. Anything else is treated as a bare name.
 *
 * Long stretches in any single segment (>40 chars) are likely the
 * profile headline rather than a person's name — when that happens for
 * the first segment we fall back to the URL slug to avoid stuffing the
 * whole headline into `contacts.name`.
 */
function parseLinkedInTitle(title: string | null, fallbackUrl: string): Parsed {
  const fallbackName = (() => {
    const slug = fallbackUrl.split('/in/')[1]?.split('/')[0]?.split('?')[0];
    return slug ? slug.replace(/-/g, ' ') : 'Unknown';
  })();

  if (!title) {
    return { name: fallbackName, title: null, companyName: null };
  }

  const stripped = title
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')
    .replace(/\s*-\s*LinkedIn\s*$/i, '')
    .trim();

  // Standard LinkedIn dash format.
  const dashMatch = stripped.match(/^(.+?)\s+-\s+(.+?)(?:\s+at\s+(.+))?$/i);
  if (dashMatch) {
    const name = dashMatch[1].trim();
    if (name.length <= 40) {
      return {
        name,
        title: dashMatch[2].trim(),
        companyName: dashMatch[3]?.trim() ?? null,
      };
    }
  }

  // Pipe-separated headline.
  if (stripped.includes('|')) {
    const segments = stripped.split('|').map((s) => s.trim()).filter(Boolean);
    if (segments.length >= 2) {
      const first = segments[0];
      const name = first.length <= 40 ? first : fallbackName;

      let pTitle: string | null = null;
      let pCompany: string | null = null;
      for (const seg of segments.slice(1)) {
        const atMatch = seg.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
        if (atMatch) {
          pTitle = atMatch[1].trim();
          pCompany = atMatch[2].trim();
          break;
        }
      }
      if (!pTitle) {
        // No "at"/"@" hint — second segment is a free-form headline tagline.
        pTitle = segments[1] ?? null;
      }
      return { name, title: pTitle, companyName: pCompany };
    }
  }

  // Bare string — accept as name only if short enough.
  if (stripped.length <= 40) {
    return { name: stripped, title: null, companyName: null };
  }
  return { name: fallbackName, title: null, companyName: null };
}

/**
 * Resolve the canonical fields for a profile result. Prefers Exa's
 * structured `author` (populated by `category: 'linkedin profile'`) for
 * the name; falls through to the legacy title parser otherwise.
 */
function extractProfile(result: ExaSearchResult): Parsed {
  const fromTitle = parseLinkedInTitle(result.title, result.url);
  if (result.author && result.author.trim()) {
    const name = result.author.trim();
    // Trust Exa's author for the name, but keep title/company from the
    // title parse — Exa rarely returns those structured.
    return { name, title: fromTitle.title, companyName: fromTitle.companyName };
  }
  return fromTitle;
}

/**
 * Compose the document we embed for each contact. Includes the highlight
 * excerpts (when available) so the embedding reflects the parts of the
 * profile that actually matched the study — not just the page-wide
 * snippet.
 */
function buildEmbedDoc(parsed: Parsed, result: ExaSearchResult): string {
  const parts = [
    parsed.name,
    parsed.title ?? '',
    parsed.companyName ?? '',
    result.highlights.join(' ') || result.text?.slice(0, 500) || '',
  ];
  return parts.filter(Boolean).join(' — ');
}

export async function runDiscovery(
  supabase: SupabaseClient,
  config: Config,
  ownerId: string,
  input: DiscoveryInput,
): Promise<DiscoveryOutput> {
  const study = await getStudyById(supabase, input.studyId);
  if (!study) throw new AppError('not_found', 'Study not found');

  // Build queries from the structured ICP — `find_candidates` already
  // gated on score, so we can rely on it being thick. Three targeted
  // variants run in parallel, dedupe by URL after merge:
  //   1. AUDIENCE-LED: audience + attributes — finds the right person
  //   2. PROBLEM-LED:  problem + signals + audience — finds people
  //                    whose stated frustrations match
  //   3. CONTEXT-LED:  attributes + product domain — finds people in
  //                    the right context (industry/role/etc.)
  // Different angles on the same audience widen coverage compared
  // to a single concatenated query. Cost: 3x Exa calls for an
  // ~estimate ~2x dedupe-merged unique results.
  const ctx = study.researchContext;
  const icp = ctx.product?.icp;
  if (!icp) {
    throw new AppError(
      'validation',
      'Study has no ICP — discovery requires `product.icp` populated. Refine via `update_study` first.',
    );
  }
  const attrValues = (icp.attributes ?? [])
    .map((a) => a.value)
    .filter(Boolean);
  const attrPart = attrValues.join(' · ');
  const geoPart = icp.geography ?? '';
  const signalsPart = (icp.signals ?? []).join(', ');
  const productDomain = ctx.product?.description ?? '';
  const extra = input.extraCriteria ?? '';

  const audienceLedQuery = [
    icp.audience,
    attrPart,
    geoPart,
    extra,
  ]
    .filter(Boolean)
    .join('. ');
  const problemLedQuery = [
    icp.problem,
    signalsPart,
    icp.audience,
    extra,
  ]
    .filter(Boolean)
    .join('. ');
  const contextLedQuery = [
    attrPart,
    productDomain,
    icp.audience,
    geoPart,
  ]
    .filter(Boolean)
    .join('. ');

  // Highlights query stays a tight one-liner — what should the
  // per-result excerpts answer? "Why does this person match?"
  const highlightsQuery = icp.summary;

  // Per-variant numResults — total cap at input.limit, split evenly
  // across active variants. Floor at 3 per variant so each contributes
  // meaningfully even on small limits.
  const variants = [audienceLedQuery, problemLedQuery, contextLedQuery].filter(Boolean);
  const perVariant = Math.max(3, Math.ceil(input.limit / variants.length));

  const exaCommon = {
    numResults: perVariant,
    includeDomains: ['linkedin.com'],
    category: 'linkedin profile',
    livecrawl: 'preferred' as const,
    includeText: true,
    highlights: { numSentences: 2, highlightsPerUrl: 2, query: highlightsQuery },
  };

  const variantResults = await Promise.all(
    variants.map((query) => exaSearch(config.exaApiKey, { ...exaCommon, query })),
  );

  // Merge + dedupe by URL, preserve first-seen order so the
  // audience-led variant's top hits stay near the top.
  const seenUrls = new Set<string>();
  const merged: typeof variantResults[number] = [];
  for (const list of variantResults) {
    for (const r of list) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      merged.push(r);
    }
  }
  // Cap to caller's requested limit AFTER merge so multi-variant
  // overlap doesn't blow past the budget.
  const results = merged.slice(0, input.limit);

  // Filter to person profiles only, even though category should already
  // restrict — defensive against indexer drift.
  const profiles = results.filter((r) => /linkedin\.com\/in\//i.test(r.url));
  const skipped = results.length - profiles.length;

  if (profiles.length === 0) {
    return { candidateCount: 0, skipped, errors: 0, errorSamples: [], tokensUsed: 0 };
  }

  // Parse + build embed docs in lockstep so vectors line up by index.
  const parsedList = profiles.map(extractProfile);
  const docs = profiles.map((r, i) => buildEmbedDoc(parsedList[i], r));

  // Single batched embedding call replaces N round-trips.
  const { embeddings, tokens: tokensUsed } = await embedTexts(config.openaiApiKey, docs);

  // Bulk-upsert all contacts in one round-trip; result map is keyed by
  // linkedin_url so we don't depend on PostgREST result ordering.
  const upsertInputs = profiles.map((result, i) => ({
    ownerId,
    linkedinUrl: result.url,
    name: parsedList[i].name,
    title: parsedList[i].title,
    companyName: parsedList[i].companyName,
    companyDomain: null,
    email: null,
    location: null,
    profileJson: {
      rawTitle: result.title,
      snippet: result.text,
      highlights: result.highlights,
      highlightsQuery,
      exaScore: result.score,
      publishedDate: result.publishedDate,
    },
    embedding: embeddings[i],
  }));
  const contactsByUrl = await bulkUpsertContactsByLinkedIn(supabase, upsertInputs);

  // Build candidate inserts, dropping any rows whose contact didn't come
  // back from the upsert (defensive — shouldn't happen). Anything dropped
  // counts as an error so the job report stays honest.
  const candidateInputs: Parameters<typeof insertCandidates>[1] = [];
  let errors = 0;
  const errorSamples: string[] = [];
  for (const result of profiles) {
    const contact = contactsByUrl.get(result.url);
    if (!contact) {
      errors += 1;
      if (errorSamples.length < MAX_ERRORS_CAPTURED) {
        errorSamples.push(`${result.url}: contact upsert returned no row`);
      }
      continue;
    }
    candidateInputs.push({
      studyId: input.studyId,
      contactId: contact.id,
      source: 'discovery',
      matchScore: result.score,
      status: 'pending_review',
    });
  }

  // `insertCandidates` is idempotent on (study_id, contact_id) — if
  // discovery re-surfaces a person already linked to this study, the
  // duplicate is silently dropped server-side. The gap between rows
  // we asked to insert and ids we got back becomes additional skipped.
  const insertedIds = await insertCandidates(supabase, candidateInputs);
  const duplicates = candidateInputs.length - insertedIds.length;

  return {
    candidateCount: insertedIds.length,
    skipped: skipped + duplicates,
    errors,
    errorSamples,
    tokensUsed,
  };
}
