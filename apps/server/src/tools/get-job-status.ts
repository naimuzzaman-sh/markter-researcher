import { z } from 'zod';
import { getAgentJobById } from '../db/agent-jobs';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ jobId: z.string().uuid() });

export const getJobStatusTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_job_status',
  description:
    'Poll the status of an async agent job (discovery/research/outreach). Status progresses queued → running → succeeded | failed. When succeeded, `output` holds the result summary.',
  inputSchema,
  async execute(args, ctx) {
    const job = await getAgentJobById(ctx.supabase, args.jobId, ctx.userId);
    if (!job) throw new AppError('not_found', 'Agent job not found');
    return {
      jobId: job.id,
      kind: job.kind,
      status: job.status,
      input: job.inputJson,
      output: job.outputJson,
      error: job.error,
      costUsd: job.costUsd,
      tokensUsed: job.tokensUsed,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
    };
  },
};
