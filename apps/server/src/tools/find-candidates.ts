import { z } from 'zod';
import {
  insertAgentJob,
  completeAgentJob,
  failAgentJob,
} from '../db/agent-jobs';
import { studyBelongsToOwner } from '../db/candidates';
import { getStudyById } from '../db/studies';
import { AppError } from '../lib/errors';
import { runDiscovery } from './_run-discovery';
import type { Tool } from './types';

const inputSchema = z.object({
  studyId: z.string().uuid(),
  limit: z.number().int().positive().max(50).optional(),
  extraCriteria: z.string().max(500).optional(),
});

export const findCandidatesTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'find_candidates',
  description:
    "Kick off async candidate discovery for a study: builds targeted Exa queries from the study's structured ICP (audience + problem + concrete attributes), searches LinkedIn, creates candidates with status=`pending_review`, returns a `jobId`. **PRECONDITION — you self-judge the ICP before calling.** Read `study.researchContext.product.icp` and confirm: `audience` is a concrete role / persona (NOT \"people\", \"users\", \"anyone\"); `problem` is a specific one-sentence pain; `attributes` has ≥3 entries with non-generic values that a search engine could filter on. If any of those is thin, refine via `update_study({ studyId, patch: { product: { icp: ... } } })` first, then call this tool. The server only enforces structural shape (Zod) — semantic concreteness is your job, since you already have the ICP in context. Poll progress with `get_job_status`; when succeeded, call `list_candidates_for_study` to inspect the results. Optional `extraCriteria` narrows or shifts the search. Do not echo `jobId` or any tool name back to the user — the UI surfaces job state via its own card.",
  inputSchema,
  async execute(args, ctx) {
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Study not found');

    // Structural gate only — the calling agent self-judges semantic
    // concreteness from the tool description. We don't run a server-
    // side LLM judgment because the MCP client is itself an LLM with
    // the ICP in context; doing so would be a duplicate token bill.
    const study = await getStudyById(ctx.supabase, args.studyId);
    if (!study) throw new AppError('not_found', 'Study not found');
    if (!study.researchContext.product?.icp) {
      throw new AppError(
        'validation',
        "Study has no ICP yet. Set `product.icp` via `update_study` (audience, problem, ≥3 concrete attributes) before calling find_candidates.",
      );
    }

    const input = { studyId: args.studyId, limit: args.limit ?? 10, extraCriteria: args.extraCriteria };
    const jobId = await insertAgentJob(ctx.supabase, {
      ownerId: ctx.userId,
      kind: 'discovery',
      inputJson: input,
    });

    // Fire-and-forget execution. Errors surface on the job row via failAgentJob.
    setImmediate(() => {
      runDiscovery(ctx.supabase, ctx.config, ctx.userId, input)
        .then((output) =>
          completeAgentJob(ctx.supabase, jobId, {
            outputJson: output,
            costUsd: null,
            tokensUsed: output.tokensUsed,
          }),
        )
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          void failAgentJob(ctx.supabase, jobId, message);
        });
    });

    // No `next` field on the wire — when present, the agent tends to
    // parrot tool names and raw IDs back to the user. The agent already
    // knows the polling pattern from the tool description.
    return {
      jobId,
      kind: 'discovery' as const,
      status: 'queued' as const,
      studyId: args.studyId,
      studyName: study?.researchContext.product?.name ?? null,
    };
  },
};
