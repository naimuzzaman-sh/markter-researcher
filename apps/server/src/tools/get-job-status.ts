import { z } from 'zod';
import { getAgentJobById } from '../db/agent-jobs';
import { getStudyById } from '../db/studies';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ jobId: z.string().uuid() });

export const getJobStatusTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_job_status',
  description:
    "Poll the status of an async agent job (discovery / research / outreach). Status progresses queued → running → succeeded | failed. When succeeded, `output` carries the result summary. `studyId` and `studyName` are surfaced when the job's input contains a studyId so callers can reference the study by name.",
  inputSchema,
  async execute(args, ctx) {
    const job = await getAgentJobById(ctx.supabase, args.jobId, ctx.userId);
    if (!job) throw new AppError('not_found', 'Agent job not found');

    // Pull studyId out of the job input if present, then resolve studyName
    // so the JobStatus card can compose user-facing prompts.
    const input = (job.inputJson ?? null) as { studyId?: string } | null;
    // The job itself is owner-scoped via `getAgentJobById`, so any studyId
    // recorded on its input must already belong to this user.
    const studyId = input?.studyId ?? null;
    const study = studyId ? await getStudyById(ctx.supabase, studyId) : null;

    return {
      jobId: job.id,
      kind: job.kind,
      status: job.status,
      input: job.inputJson,
      output: job.outputJson,
      error: job.error,
      studyId,
      studyName: study?.researchContext.product?.name ?? null,
      costUsd: job.costUsd,
      tokensUsed: job.tokensUsed,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
    };
  },
};
