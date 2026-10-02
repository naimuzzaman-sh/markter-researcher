import type { SupabaseClient } from '@supabase/supabase-js';
import {
  studyResultsSchema,
  type StudyResults,
  type ResearchContext,
} from '@mirrars/shared';
import { getStudyById, updateStudyResults } from '../db/studies';
import { listCompletedInterviewsForStudySummarization } from '../db/interviews';
import { AppError } from '../lib/errors';
import { chatCompletionJson } from '../external/openai';
import { zodToJsonSchema } from './zod-to-json-schema';

/**
 * Study-level synthesis across all completed interviews. Triggered
 * (fire-and-forget) at the end of every interview that lands
 * successfully — see `routes/calls.ts`. Each new interview replaces
 * the prior `studies.results` payload (last-writer-wins is fine: the
 * inputs are stable persisted transcripts).
 *
 * No-ops cleanly when there are zero completed interviews — leaves
 * `results` untouched so the UI keeps showing nothing rather than an
 * empty synthesis.
 *
 * Switched from Gemini to OpenAI strict structured-output mode after
 * frequent 503s + occasional fence/shape drift.
 */

const MODEL = 'gpt-5-mini';

// `interviewCount` + `lastUpdated` are stamped server-side from the
// canonical interviews list; we don't trust the LLM for either. The
// schema we hand the model omits both so it can't fabricate them.
const llmResultsJsonSchema = zodToJsonSchema(
  studyResultsSchema.omit({ interviewCount: true, lastUpdated: true }),
);

function buildSummaryPrompt(args: {
  context: Partial<ResearchContext>;
  interviews: Array<{
    interviewId: string;
    transcript: { role: 'user' | 'agent'; message: string; timeInCallSecs: number }[];
    analysis: { keyInsights?: string[]; productMarketFitSignals?: string[] } | null;
  }>;
}): string {
  const productName = args.context.product?.name ?? 'the product';
  const objective = args.context.research?.objective ?? '(no objective set)';
  const audience = args.context.product?.icp?.summary ?? '(no audience set)';

  const interviewsBlock = args.interviews
    .map((iv, idx) => {
      const turns = iv.transcript
        .map(
          (t) => `  ${t.role.toUpperCase()} (${t.timeInCallSecs}s): ${t.message}`,
        )
        .join('\n');
      const insights = iv.analysis?.keyInsights?.length
        ? `\n  KEY INSIGHTS:\n  - ${iv.analysis.keyInsights.join('\n  - ')}`
        : '';
      const signals = iv.analysis?.productMarketFitSignals?.length
        ? `\n  PMF SIGNALS:\n  - ${iv.analysis.productMarketFitSignals.join('\n  - ')}`
        : '';
      return `## Interview ${idx + 1} (${iv.interviewId})\n${turns}${insights}${signals}`;
    })
    .join('\n\n');

  return `You are synthesizing findings across ALL interviews collected for a single research study. Return STRICT JSON matching the required schema.

## Study context
PRODUCT: ${productName}
OBJECTIVE: ${objective}
TARGET AUDIENCE: ${audience}

## Interviews (${args.interviews.length})
${interviewsBlock}

## What to extract
- summary: 1-2 paragraph plain-English synthesis. What did we learn? What's the headline?
- themes: 3-7 short topic labels that recurred across interviews (e.g. "Friction with manual setup", "Strong demand for mobile parity")
- painPoints: 3-7 concrete frustrations interviewees expressed, in their language where possible
- pmfSignalsObserved: 2-5 specific moments / quotes / behaviors that suggest PMF (or its absence) — be precise, ground each in the interview data
- recommendations: 2-4 actionable next steps for the researcher (e.g. "Validate pricing range with 5 more interviews", "Prototype the auto-import flow before next batch")

Be precise. Ground every claim in the interview data. If interviews disagree, name the disagreement explicitly. Don't pad — fewer high-quality items beats more weak ones.`;
}

export async function summarizeStudy(args: {
  apiKey: string;
  supabase: SupabaseClient;
  studyId: string;
}): Promise<StudyResults | null> {
  const study = await getStudyById(args.supabase, args.studyId);
  if (!study) return null;

  const interviews = await listCompletedInterviewsForStudySummarization(
    args.supabase,
    args.studyId,
  );
  // Zero interviews → nothing to synthesize. Return null and leave
  // existing results (if any) untouched.
  if (interviews.length === 0) return null;

  const { data } = await chatCompletionJson<unknown>({
    apiKey: args.apiKey,
    model: MODEL,
    prompt: buildSummaryPrompt({
      context: study.researchContext,
      interviews,
    }),
    schemaName: 'study_results',
    schema: llmResultsJsonSchema,
  });

  // Stamp the count + timestamp ourselves — the LLM doesn't need to
  // know the canonical values, and trusting it for a count it can
  // miscount is sloppy.
  const stamped = {
    ...(data as Record<string, unknown>),
    interviewCount: interviews.length,
    lastUpdated: new Date().toISOString(),
  };

  const result = studyResultsSchema.safeParse(stamped);
  if (!result.success) {
    throw new AppError(
      'upstream',
      `OpenAI summary failed schema: ${result.error.issues[0]?.message ?? 'unknown'}`,
    );
  }

  await updateStudyResults(args.supabase, args.studyId, result.data);
  return result.data;
}
