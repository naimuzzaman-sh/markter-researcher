import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const getBriefInput = z.object({
  briefId: z
    .string()
    .min(1)
    .describe('UUID of the brief to fetch. Use `list_briefs` to discover.'),
});

export const getBriefConfig = {
  title: 'Get a research brief',
  description:
    'Returns the full research context of one brief: product / company description, research objective, the interview questions, PMF hypothesis, interview settings, plus the shareable URL you can send to interviewees.',
  inputSchema: getBriefInput.shape,
};

type Input = z.infer<typeof getBriefInput>;

function shareableUrl(baseUrl: string, briefId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/interview/${briefId}`;
}

export function makeGetBriefHandler(client: ApiClient, baseUrl: string) {
  return async (args: Input) => {
    const brief = await client.getBrief(args.briefId);

    if (!brief) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Brief \`${args.briefId}\` not found, or you don't own it.`,
          },
        ],
      };
    }

    const payload = {
      briefId: brief.id,
      researchContext: brief.researchContext,
      createdAt: brief.createdAt.toISOString(),
      shareableUrl: shareableUrl(baseUrl, brief.id),
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
