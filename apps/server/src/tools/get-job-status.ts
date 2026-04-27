import { z } from 'zod';
import { getAgentJobById } from '../db/agent-jobs';
import { getBriefById } from '../db/briefs';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ jobId: z.string().uuid() });

export const getJobStatusTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_job_status',
  description:
    'Poll the status of an async agent job (discovery/research/outreach). Status progresses queued → running → succeeded | failed. When succeeded, `output` holds the result summary. `briefId` and `briefName` are surfaced when the job\'s input contains a briefId so callers can reference the brief by name.',
  inputSchema,
  async execute(args, ctx) {
    const job = await getAgentJobById(ctx.supabase, args.jobId, ctx.userId);
    if (!job) throw new AppError('not_found', 'Agent job not found');

    // Pull briefId out of the job input if present, then resolve briefName
    // so the JobStatus card can compose user-facing prompts.
    const input = (job.inputJson ?? null) as { briefId?: string } | null;
    // The job itself is owner-scoped via `getAgentJobById`, so any briefId
    // recorded on its input must already belong to this user.
    const briefId = input?.briefId ?? null;
    const brief = briefId ? await getBriefById(ctx.supabase, briefId) : null;

    return {
      jobId: job.id,
      kind: job.kind,
      status: job.status,
      input: job.inputJson,
      output: job.outputJson,
      error: job.error,
      briefId,
      briefName: brief?.researchContext.product?.name ?? null,
      costUsd: job.costUsd,
      tokensUsed: job.tokensUsed,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
    };
  },
};
