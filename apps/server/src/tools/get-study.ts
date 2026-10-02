import { z } from 'zod';
import { getStudyById } from '../db/studies';
import { studyBelongsToOwner } from '../db/candidates';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import { summarizeStudy } from '../agent/summarize-study';
import type { Tool } from './types';

const inputSchema = z.object({ studyId: z.string().uuid() });

/**
 * Single-flight set: prevents N concurrent reads from each spawning
 * their own background summarize. The first read for a stale study
 * registers; subsequent reads see it and skip until the refresh
 * settles. Module-scoped so it's shared across all `get_study` calls
 * in the process.
 */
const refreshing = new Set<string>();

/**
 * Fire-and-forget refresh of `studies.results` when it's stale —
 * either null on a study that DOES have completed interviews, or
 * older than the most recent completed interview. The user gets the
 * possibly-stale payload on THIS call (we don't block) and the fresh
 * one on the next. Self-heals after transient summarizer failures
 * without requiring an explicit `regenerate_study_results` tool.
 */
function maybeBackgroundRefresh(args: {
  apiKey: string;
  supabase: import('@supabase/supabase-js').SupabaseClient;
  study: NonNullable<Awaited<ReturnType<typeof getStudyById>>>;
}): void {
  const { study } = args;
  const studyId = study.id;
  if (refreshing.has(studyId)) return;

  // Cheap point-query — only the most-recent completed_at matters.
  // We don't need to load full transcripts here.
  void (async () => {
    try {
      const { data } = await args.supabase
        .from('interviews')
        .select('completed_at')
        .eq('study_id', studyId)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestCompletedAt = data?.completed_at as string | null | undefined;
      if (!latestCompletedAt) return; // no completed interviews → nothing to summarize

      const resultsTs = study.results?.lastUpdated ?? null;
      const isStale =
        resultsTs == null ||
        new Date(latestCompletedAt).getTime() > new Date(resultsTs).getTime();
      if (!isStale) return;

      refreshing.add(studyId);
      try {
        await summarizeStudy({
          apiKey: args.apiKey,
          supabase: args.supabase,
          studyId,
        });
      } finally {
        refreshing.delete(studyId);
      }
    } catch {
      // Swallow — this is opportunistic. Failures don't surface to
      // the read; the next read will retry.
      refreshing.delete(studyId);
    }
  })();
}

export const getStudyTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_study',
  description:
    "Fetch a study by id, including its `results` — the aggregated synthesis (themes, painPoints, pmfSignalsObserved, recommendations, summary, interviewCount, lastUpdated) computed across every completed interview. `results` is null until the first interview lands; the server auto-refreshes after every interview-end and lazily on read when stale, so the user never has to ask for a manual refresh. Also returns the full `researchContext` (company, product, structured ICP, interview questions, PMF hypothesis, signals, concerns, interview settings), the lifecycle `status` (`draft` while being assembled / `active` after promotion), the persisted `chatHistory` (conversation that built or edits this study), and `interviewUrl` (`/interview/<studyId>`) for public sharing — for a personalized invite link, use `get_interview_link` with a candidateId.",
  inputSchema,
  async execute(args, ctx) {
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Study not found');
    const study = await getStudyById(ctx.supabase, args.studyId);
    if (!study) throw new AppError('not_found', 'Study not found');

    // Opportunistic stale-results refresh. Fires in the background;
    // doesn't block this response. See `maybeBackgroundRefresh`.
    maybeBackgroundRefresh({
      apiKey: ctx.config.openaiApiKey,
      supabase: ctx.supabase,
      study,
    });

    return {
      studyId: study.id,
      researchContext: study.researchContext,
      status: study.status,
      // Chat history rides on the detail wire shape so the AgentChat
      // shell can hydrate the conversation when the user resumes a
      // study via `/assistant?studyId=<id>`. Empty array on studies
      // that pre-date persistence.
      chatHistory: study.chatHistory,
      // Study-level synthesis across all completed interviews.
      // Null until the first interview lands. UI hides the RESULTS
      // section when null.
      results: study.results,
      createdAt: study.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, study.id),
    };
  },
};
