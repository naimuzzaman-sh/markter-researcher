import { Injectable, Logger } from '@nestjs/common';
import { AgentJobsService } from '../agent-jobs/agent-jobs.service';
import { ContactsService } from '../contacts/contacts.service';
import { CandidatesService } from '../candidates/candidates.service';
import { BriefsService } from '../briefs/briefs.service';
import { OpenAIEmbeddingsService } from '../ai-providers/openai-embeddings.service';
import { ExaService, type ExaSearchResult } from '../ai-providers/exa.service';

type DiscoveryInput = {
  briefId: string;
  limit: number;
  extraCriteria?: string;
};

type DiscoveryOutput = {
  candidateCount: number;
  skipped: number;
  errors: number;
  /**
   * First N error messages encountered during processResult. Capped so the
   * output row stays small — tune `MAX_CAPTURED_ERRORS` if we want more.
   */
  errorSamples: string[];
};

/** Max error messages to persist on the job row for post-mortem debugging. */
const MAX_CAPTURED_ERRORS = 5;

type ParsedPerson = {
  name: string;
  title: string | null;
  companyName: string | null;
};

/**
 * Parse a LinkedIn search result title into person/title/company.
 * EXA titles on linkedin.com follow patterns like:
 *   "Ada Lovelace - Principal Engineer at Analytical Engines | LinkedIn"
 *   "Ada Lovelace | LinkedIn"
 *   "Jane Doe - Acme Corp"
 * Best-effort parsing — we store the raw title in profile_json so nothing is lost.
 */
function parseLinkedInTitle(title: string | null, fallbackUrl: string): ParsedPerson {
  if (!title) {
    // Fall back to the URL slug
    const slug = fallbackUrl.split('/in/')[1]?.split('/')[0]?.split('?')[0];
    return {
      name: slug ? slug.replace(/-/g, ' ') : 'Unknown',
      title: null,
      companyName: null,
    };
  }

  // Strip trailing " | LinkedIn"
  const stripped = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();

  // "Name - Title at Company" (canonical)
  const dashMatch = stripped.match(/^(.+?)\s+-\s+(.+?)(?:\s+at\s+(.+))?$/i);
  if (dashMatch) {
    return {
      name: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
      companyName: dashMatch[3]?.trim() ?? null,
    };
  }

  // Just a name
  return { name: stripped, title: null, companyName: null };
}

function extractDomain(companyName: string | null): string | null {
  if (!companyName) return null;
  // Very simple heuristic — we don't resolve domains, just note if one looks
  // embedded. Real enrichment happens in a later phase (M2+).
  const match = companyName.match(/\(([^)]+\.[a-z]{2,})\)/i);
  return match ? match[1] : null;
}

/**
 * Discovery orchestration: turns a brief + criteria into brief_candidates via
 * EXA search. Runs as an async job — enqueue returns a jobId immediately,
 * execution happens in the background (currently via setImmediate; a cron
 * resurrector is in the worker file for crash-recovery).
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly agentJobs: AgentJobsService,
    private readonly contacts: ContactsService,
    private readonly candidates: CandidatesService,
    private readonly briefs: BriefsService,
    private readonly embeddings: OpenAIEmbeddingsService,
    private readonly exa: ExaService,
  ) {}

  async enqueue(
    input: DiscoveryInput,
    ownerId: string,
  ): Promise<{ jobId: string }> {
    // Ownership gate: we only create jobs for briefs the user owns. This is
    // enforced at the API boundary so the worker never has to re-check.
    const brief = await this.briefs.getBrief(input.briefId);
    if (!brief) {
      throw new Error('Brief not found');
    }
    const { id } = await this.agentJobs.enqueue({
      ownerId,
      kind: 'discovery',
      input,
    });
    // Fire-and-forget execution. Errors are captured on the job row via
    // `fail()`; we never let them bubble into the HTTP response (the caller
    // already has the jobId and will poll for status).
    setImmediate(() => {
      void this.execute(id).catch((err) => {
        this.logger.error(
          `Discovery job ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });
    return { jobId: id };
  }

  /**
   * Execute a queued discovery job. Called from `enqueue` (setImmediate) and
   * from the worker's crash-recovery path. Idempotent: if the job is already
   * `succeeded`/`failed`/`running`, we skip.
   */
  async execute(jobId: string): Promise<void> {
    // We don't have a single-id claim helper, so poll the generic one and
    // accept that we may claim a *different* queued job (older ones first).
    // Discovery is idempotent per brief so that's fine for M1 — a more
    // targeted claim can land later if ordering matters.
    const claimed = await this.agentJobs.claimNext();
    if (!claimed) {
      // No queued job (our target may have been claimed by another invocation,
      // or it's already done). Fine — return quietly.
      return;
    }
    // We track the id we were invoked with for log correlation, but the
    // claimed job may be a different queued row. Log both for traceability.
    if (claimed.id !== jobId) {
      this.logger.debug(
        `Discovery execute(${jobId}) claimed different job ${claimed.id} — this is fine (FIFO queue).`,
      );
    }

    try {
      const input = claimed.inputJson as DiscoveryInput;
      const brief = await this.briefs.getBrief(input.briefId);
      if (!brief) {
        await this.agentJobs.fail(jobId, 'Brief not found at execution time');
        return;
      }

      const query = this.buildQuery(brief.researchContext, input.extraCriteria);
      const results = await this.exa.search({
        query,
        numResults: input.limit,
        includeDomains: ['linkedin.com'],
        includeText: true,
      });

      let candidateCount = 0;
      let skipped = 0;
      let errors = 0;
      let totalTokens = 0;
      const errorSamples: string[] = [];

      for (const result of results) {
        try {
          const processed = await this.processResult(
            result,
            claimed.ownerId,
            input.briefId,
          );
          candidateCount += processed.candidateAdded ? 1 : 0;
          skipped += processed.skipped ? 1 : 0;
          totalTokens += processed.tokens;
        } catch (err) {
          errors += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Discovery: failed to process ${result.url} — ${message}`,
          );
          if (errorSamples.length < MAX_CAPTURED_ERRORS) {
            // Keep a short prefix of the URL for context, plus the error body.
            errorSamples.push(`${result.url}: ${message}`.slice(0, 500));
          }
        }
      }

      const output: DiscoveryOutput = {
        candidateCount,
        skipped,
        errors,
        errorSamples,
      };
      await this.agentJobs.complete(claimed.id, {
        output,
        tokensUsed: totalTokens,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.agentJobs.fail(claimed.id, message);
    }
  }

  private buildQuery(
    researchContext: {
      product: { targetAudience: string };
      company: { name: string; industry: string };
    },
    extra: string | undefined,
  ): string {
    const base = `${researchContext.product.targetAudience} ${researchContext.company.industry}`.trim();
    return extra ? `${base} ${extra}`.trim() : base;
  }

  private async processResult(
    result: ExaSearchResult,
    ownerId: string,
    briefId: string,
  ): Promise<{ candidateAdded: boolean; skipped: boolean; tokens: number }> {
    // Only consider LinkedIn /in/ profile URLs — EXA occasionally returns
    // company pages or posts which aren't people.
    if (!/linkedin\.com\/in\//i.test(result.url)) {
      return { candidateAdded: false, skipped: true, tokens: 0 };
    }

    const parsed = parseLinkedInTitle(result.title, result.url);

    // Embed a compact "name + title + company + snippet" doc so semantic
    // search later can find this contact by loose concepts.
    const embedText = [
      parsed.name,
      parsed.title ?? '',
      parsed.companyName ?? '',
      result.text ? result.text.slice(0, 500) : '',
    ]
      .filter(Boolean)
      .join(' — ');

    const { embedding, tokens } = await this.embeddings.embed(embedText);

    const contact = await this.contacts.upsertByLinkedIn({
      ownerId,
      linkedinUrl: result.url,
      name: parsed.name,
      title: parsed.title,
      companyName: parsed.companyName,
      companyDomain: extractDomain(parsed.companyName),
      email: null,
      location: null,
      profileJson: {
        rawTitle: result.title,
        snippet: result.text,
        exaScore: result.score,
      },
      embedding,
    });

    await this.candidates.createCandidate({
      briefId,
      contactId: contact.id,
      source: 'discovery',
      matchScore: result.score,
      status: 'pending_review',
    });

    return { candidateAdded: true, skipped: false, tokens };
  }
}

export type { DiscoveryInput, DiscoveryOutput };
