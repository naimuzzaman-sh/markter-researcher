import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const getInterviewInput = z.object({
  interviewId: z
    .string()
    .min(1)
    .describe('UUID of the interview to fetch. Use `list_interviews` to find.'),
});

export const getInterviewConfig = {
  title: 'Get a completed interview',
  description:
    'Returns the full transcript + analysis for one interview: participant role inference, per-question sentiment, key insights, PMF signals, and suggested follow-ups. Use this for deep-dives after scanning `list_interviews`.',
  inputSchema: getInterviewInput.shape,
};

type Input = z.infer<typeof getInterviewInput>;

export function makeGetInterviewHandler(client: ApiClient) {
  return async (args: Input) => {
    const detail = await client.getInterview(args.interviewId);

    if (!detail) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Interview \`${args.interviewId}\` not found, or you don't own the brief it belongs to.`,
          },
        ],
      };
    }

    const payload = {
      interviewId: detail.interviewId,
      briefId: detail.briefId,
      status: detail.status,
      transcript: detail.transcript,
      analysis: detail.analysis,
      durationSecs: detail.durationSecs,
      completedAt: detail.completedAt
        ? detail.completedAt.toISOString()
        : null,
    };

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
