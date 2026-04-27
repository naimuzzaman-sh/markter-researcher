/**
 * Discovery orchestration helper — not a tool itself. Runs inside the
 * background execution of a `find_candidates` job.
 *
 * Flow:
 *   1. Load brief by id (ownership already verified at enqueue time)
 *   2. Build query from brief.researchContext.product.targetAudience + extra
 *   3. EXA search restricted to linkedin.com
 *   4. For each /in/ profile result:
 *        - parse name/title/company from the EXA title
 *        - embed "name + title + company + text" via OpenAI
 *        - upsert contact by (owner_id, linkedin_url)
 *        - insert brief_candidate (status=pending_review, source=discovery)
 *   5. Return summary { candidateCount, skipped, errors, errorSamples, tokens }
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import { getBriefById } from '../db/briefs';
import { upsertContactByLinkedIn } from '../db/contacts';
import { insertCandidate } from '../db/candidates';
import { exaSearch, type ExaSearchResult } from '../external/exa';
import { embedText } from '../external/openai';
import { AppError } from '../lib/errors';

type DiscoveryInput = {
  briefId: string;
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
 * Heuristics, ordered by reliability:
 *
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
 * whole headline into `contacts.name` (the bug that necessitated
 * client-side stripping).
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

async function processResult(
  supabase: SupabaseClient,
  config: Config,
  ownerId: string,
  briefId: string,
  result: ExaSearchResult,
): Promise<{ added: boolean; skipped: boolean; tokens: number }> {
  if (!/linkedin\.com\/in\//i.test(result.url)) {
    return { added: false, skipped: true, tokens: 0 };
  }

  const parsed = parseLinkedInTitle(result.title, result.url);
  const doc = [parsed.name, parsed.title ?? '', parsed.companyName ?? '', result.text?.slice(0, 500) ?? '']
    .filter(Boolean)
    .join(' — ');

  const { embedding, tokens } = await embedText(config.openaiApiKey, doc);

  const contact = await upsertContactByLinkedIn(supabase, {
    ownerId,
    linkedinUrl: result.url,
    name: parsed.name,
    title: parsed.title,
    companyName: parsed.companyName,
    companyDomain: null,
    email: null,
    location: null,
    profileJson: { rawTitle: result.title, snippet: result.text, exaScore: result.score },
    embedding,
  });

  await insertCandidate(supabase, {
    briefId,
    contactId: contact.id,
    source: 'discovery',
    matchScore: result.score,
    status: 'pending_review',
  });

  return { added: true, skipped: false, tokens };
}

export async function runDiscovery(
  supabase: SupabaseClient,
  config: Config,
  ownerId: string,
  input: DiscoveryInput,
): Promise<DiscoveryOutput> {
  const brief = await getBriefById(supabase, input.briefId);
  if (!brief) throw new AppError('not_found', 'Brief not found');

  const baseQuery = `${brief.researchContext.product.targetAudience} ${brief.researchContext.company.industry}`.trim();
  const query = input.extraCriteria ? `${baseQuery} ${input.extraCriteria}` : baseQuery;

  const results = await exaSearch(config.exaApiKey, {
    query,
    numResults: input.limit,
    includeDomains: ['linkedin.com'],
    includeText: true,
  });

  let candidateCount = 0;
  let skipped = 0;
  let errors = 0;
  let tokensUsed = 0;
  const errorSamples: string[] = [];

  for (const result of results) {
    try {
      const r = await processResult(supabase, config, ownerId, input.briefId, result);
      if (r.added) candidateCount += 1;
      if (r.skipped) skipped += 1;
      tokensUsed += r.tokens;
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      if (errorSamples.length < MAX_ERRORS_CAPTURED) {
        errorSamples.push(`${result.url}: ${message}`.slice(0, 500));
      }
    }
  }

  return { candidateCount, skipped, errors, errorSamples, tokensUsed };
}
