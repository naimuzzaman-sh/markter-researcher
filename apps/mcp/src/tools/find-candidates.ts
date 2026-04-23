import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const findCandidatesInput = z.object({
  briefId: z
    .string()
    .uuid()
    .describe('Brief to find interview candidates for.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe('Max candidates to discover (1-50, default 10).'),
  extraCriteria: z
    .string()
    .max(500)
    .optional()
    .describe(
      'Freeform text appended to the brief\'s target-audience query. Use to narrow by seniority, geography, or company size.',
    ),
});

export const findCandidatesConfig = {
  title: 'Find interview candidates (discovery)',
  description:
    'Kicks off an async discovery run: searches LinkedIn via EXA for people matching the brief\'s target audience (optionally refined by `extraCriteria`), creates candidate rows with status=pending_review, and returns a `jobId`. Poll with `get_job_status` until it reaches `succeeded`, then call `list_candidates_for_brief` to see results.',
  inputSchema: findCandidatesInput.shape,
};

type Input = z.infer<typeof findCandidatesInput>;

export function makeFindCandidatesHandler(client: ApiClient) {
  return async (args: Input) => {
    const { jobId } = await client.runDiscovery({
      briefId: args.briefId,
      limit: args.limit,
      extraCriteria: args.extraCriteria,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              jobId,
              status: 'queued',
              next: `Poll with get_job_status({ jobId: "${jobId}" }) every ~5s. When status becomes "succeeded", call list_candidates_for_brief({ briefId: "${args.briefId}" }) to see the discovered people. Each will arrive with status "pending_review" — approve or reject them with approve_candidate / reject_candidate.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  };
}
