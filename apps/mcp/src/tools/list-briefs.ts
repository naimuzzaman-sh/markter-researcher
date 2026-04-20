import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const listBriefsInput = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max number of briefs to return (default 20).'),
});

export const listBriefsConfig = {
  title: 'List research briefs',
  description:
    'Returns the briefs you own, newest first. Each brief corresponds to an interview campaign (questions, target audience, objective). Use this to find a brief ID before calling `get_brief` or `list_interviews`.',
  inputSchema: listBriefsInput.shape,
};

type Input = z.infer<typeof listBriefsInput>;

function shareableUrl(baseUrl: string, briefId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/interview/${briefId}`;
}

export function makeListBriefsHandler(client: ApiClient, baseUrl: string) {
  return async (args: Input) => {
    const limit = args.limit ?? 20;
    const briefs = await client.listBriefs(limit);

    if (briefs.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'You have no briefs yet. Create one with `preview_brief` + `create_brief`.',
          },
        ],
      };
    }

    const payload = briefs.map((b) => ({
      briefId: b.id,
      productName: b.researchContext.product.name,
      objective: b.researchContext.research.objective,
      createdAt: b.createdAt.toISOString(),
      shareableUrl: shareableUrl(baseUrl, b.id),
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
