import { z } from 'zod';
import {
  insertAgentJob,
  completeAgentJob,
  failAgentJob,
} from '../db/agent-jobs';
import { briefBelongsToOwner } from '../db/candidates';
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
    'Kick off an async discovery run: EXA-searches LinkedIn for people matching the brief\'s target audience (+ optional extraCriteria), creates candidates with status=pending_review, returns a `jobId`. Poll with `get_job_status`; when succeeded, call `list_candidates_for_brief`.',
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

    return {
      jobId,
      status: 'queued' as const,
      next: `Poll with get_job_status({ jobId: "${jobId}" }) until succeeded, then list_candidates_for_brief({ briefId: "${args.briefId}" }).`,
    };
  },
};
