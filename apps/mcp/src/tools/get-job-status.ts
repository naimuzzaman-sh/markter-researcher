import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const getJobStatusInput = z.object({
  jobId: z.string().uuid().describe('Agent job id returned by find_candidates.'),
});

export const getJobStatusConfig = {
  title: 'Get agent job status',
  description:
    'Returns the current status of an async agent job (discovery/research/outreach). Poll this after `find_candidates` or similar: `status` progresses queued → running → succeeded | failed. When succeeded, `output` contains the result summary (e.g. candidateCount for discovery).',
  inputSchema: getJobStatusInput.shape,
};

type Input = z.infer<typeof getJobStatusInput>;

export function makeGetJobStatusHandler(client: ApiClient) {
  return async (args: Input) => {
    const job = await client.getAgentJob(args.jobId);
    if (!job) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No agent job found with id ${args.jobId}. It may have been deleted, or it belongs to a different user.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
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
            },
            null,
            2,
          ),
        },
      ],
    };
  };
}
