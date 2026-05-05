import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  briefResultsSchema,
  type BriefResults,
  type ResearchContext,
} from '@mirrars/shared';
import { getBriefById, updateBriefResults } from '../db/briefs';
import { listCompletedInterviewsForBriefSummarization } from '../db/interviews';
import { AppError } from '../lib/errors';

/**
 * Brief-level synthesis across all completed interviews. Triggered
 * (fire-and-forget) at the end of every interview that lands
 * successfully — see `routes/calls.ts`. Each new interview replaces
 * the prior `briefs.results` payload (last-writer-wins is fine: the
 * inputs are stable persisted transcripts).
 *
 * No-ops cleanly when there are zero completed interviews — leaves
 * `results` untouched so the UI keeps showing nothing rather than an
 * empty synthesis.
 */

const MODEL = 'gemini-2.5-flash';

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
  const audience = args.context.product?.targetAudience ?? '(no audience set)';

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

  return `You are synthesizing findings across ALL interviews collected for a single research brief. Return STRICT JSON matching the required schema.

## Brief context
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

export async function summarizeBrief(args: {
  apiKey: string;
  supabase: SupabaseClient;
  briefId: string;
}): Promise<BriefResults | null> {
  const brief = await getBriefById(args.supabase, args.briefId);
  if (!brief) return null;

  const interviews = await listCompletedInterviewsForBriefSummarization(
    args.supabase,
    args.briefId,
  );
  // Zero interviews → nothing to synthesize. Return null and leave
  // existing results (if any) untouched.
  if (interviews.length === 0) return null;

  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: buildSummaryPrompt({
              context: brief.researchContext,
              interviews,
            }),
          },
        ],
      },
    ],
    config: { responseMimeType: 'application/json' },
  });

  const text =
    response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new AppError('upstream', 'Gemini summary returned empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError('upstream', 'Gemini summary response was not valid JSON');
  }

  // Stamp the count + timestamp ourselves — the LLM doesn't need to
  // know the canonical values, and trusting it for a count it can
  // miscount is sloppy.
  const stamped = {
    ...(parsed as Record<string, unknown>),
    interviewCount: interviews.length,
    lastUpdated: new Date().toISOString(),
  };

  const result = briefResultsSchema.safeParse(stamped);
  if (!result.success) {
    throw new AppError(
      'upstream',
      `Gemini summary failed schema: ${result.error.issues[0]?.message ?? 'unknown'}`,
    );
  }

  await updateBriefResults(args.supabase, args.briefId, result.data);
  return result.data;
}
