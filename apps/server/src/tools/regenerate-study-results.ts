import { z } from 'zod';
import { studyBelongsToOwner } from '../db/candidates';
import { summarizeStudy } from '../agent/summarize-study';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ studyId: z.string().uuid() });

/**
 * Manual trigger for the cross-interview synthesizer that normally
 * fires automatically at the end of every successful interview.
 * Three reasons to call it:
 *   1. The auto-run failed (transient Gemini 503) and `results` is
 *      still null on a study that DOES have completed interviews.
 *   2. The researcher edited the study's research questions and
 *      wants the synthesis to reflect the new framing.
 *   3. Force a refresh after manual transcript clean-up / analysis
 *      backfill.
 *
 * No-ops cleanly when there are zero completed interviews — leaves
 * `results` untouched (still null) and returns null.
 */
export const regenerateStudyResultsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'regenerate_study_results',
  description:
    "Re-synthesize a study's `results` (themes, painPoints, pmfSignalsObserved, recommendations, summary) across all completed interviews. Use when results are null after the first interview (likely a transient Gemini 503), after editing the study's research questions, or when you want to force a refresh. Returns the updated results payload (interviewCount, lastUpdated, summary, themes, painPoints, pmfSignalsObserved, recommendations), or null if the study has no completed interviews yet. Owner-gated.",
  inputSchema,
  async execute(args, ctx) {
    // Owner-gate first — otherwise we'd burn a Gemini call on someone
    // else's study and leak existence via timing.
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Study not found');

    const result = await summarizeStudy({
      apiKey: ctx.config.geminiApiKey,
      supabase: ctx.supabase,
      studyId: args.studyId,
    });
    return result;
  },
};
