import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const listInterviewsInput = z.object({
  briefId: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional — narrow results to a single brief. Omit to list interviews across all of your briefs.',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe('Max number of interviews to return (default 50).'),
});

export const listInterviewsConfig = {
  title: 'List completed interviews',
  description:
    'Returns interview summaries (status, duration, overall sentiment, completion time) you own, newest first. Use `get_interview` with one of the returned interviewIds to inspect transcripts + analysis.',
  inputSchema: listInterviewsInput.shape,
};

type Input = z.infer<typeof listInterviewsInput>;

export function makeListInterviewsHandler(client: ApiClient) {
  return async (args: Input) => {
    const limit = args.limit ?? 50;
    const rows = await client.listInterviews(args.briefId, limit);

    if (rows.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: args.briefId
              ? `No interviews found for brief \`${args.briefId}\`.`
              : 'No interviews found. Share a brief URL with interviewees to collect some.',
          },
        ],
      };
    }

    const payload = rows.map((r) => ({
      interviewId: r.interviewId,
      briefId: r.briefId,
      status: r.status,
      durationSecs: r.durationSecs,
      overallSentiment: r.overallSentiment,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  };
}
