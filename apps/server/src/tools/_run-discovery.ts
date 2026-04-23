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

function parseLinkedInTitle(title: string | null, fallbackUrl: string): Parsed {
  if (!title) {
    const slug = fallbackUrl.split('/in/')[1]?.split('/')[0]?.split('?')[0];
    return { name: slug ? slug.replace(/-/g, ' ') : 'Unknown', title: null, companyName: null };
  }
  const stripped = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
  const match = stripped.match(/^(.+?)\s+-\s+(.+?)(?:\s+at\s+(.+))?$/i);
  if (match) {
    return { name: match[1].trim(), title: match[2].trim(), companyName: match[3]?.trim() ?? null };
  }
  return { name: stripped, title: null, companyName: null };
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
