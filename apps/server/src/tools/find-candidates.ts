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
    "Kick off async candidate discovery for a study: searches the web for people matching the study's target audience (+ optional `extraCriteria` to narrow or shift the search), creates candidates with status=`pending_review`, returns a `jobId`. Poll progress with `get_job_status`; when succeeded, call `list_candidates_for_study` to inspect the results. Do not echo `jobId` or any tool name back to the user — the UI surfaces job state via its own card.",
  inputSchema,
  async execute(args, ctx) {
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Study not found');

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

    // Ownership enforced by `studyBelongsToOwner` above. Surface studyName
    // so the JobStatus card can compose pill prompts without a round-trip.
    const study = await getStudyById(ctx.supabase, args.studyId);

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
