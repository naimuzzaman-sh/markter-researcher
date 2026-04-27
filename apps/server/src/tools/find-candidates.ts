import { z } from 'zod';
import {
  insertAgentJob,
  completeAgentJob,
  failAgentJob,
} from '../db/agent-jobs';
import { briefBelongsToOwner } from '../db/candidates';
import { getBriefById } from '../db/briefs';
import { AppError } from '../lib/errors';
import { runDiscovery } from './_run-discovery';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid(),
  limit: z.number().int().positive().max(50).optional(),
  extraCriteria: z.string().max(500).optional(),
});

export const findCandidatesTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'find_candidates',
  description:
    'Kick off an async discovery run: searches the web for people matching the brief\'s target audience (+ optional extraCriteria), creates candidates with status=pending_review, returns a `jobId`. Poll with `get_job_status`; when succeeded, call `list_candidates_for_brief`. Do not echo `jobId` or any tool name to the user — the UI surfaces job state.',
  inputSchema,
  async execute(args, ctx) {
    const owns = await briefBelongsToOwner(ctx.supabase, args.briefId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Brief not found');

    const input = { briefId: args.briefId, limit: args.limit ?? 10, extraCriteria: args.extraCriteria };
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

    // Ownership enforced by `briefBelongsToOwner` above. Surface briefName
    // so the JobStatus card can compose pill prompts without a round-trip.
    const brief = await getBriefById(ctx.supabase, args.briefId);

    // No `next` field on the wire — when present, the agent tends to
    // parrot tool names and raw IDs back to the user. The agent already
    // knows the polling pattern from the tool description.
    return {
      jobId,
      kind: 'discovery' as const,
      status: 'queued' as const,
      briefId: args.briefId,
      briefName: brief?.researchContext.product?.name ?? null,
    };
  },
};
