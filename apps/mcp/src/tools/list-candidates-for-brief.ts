import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const listCandidatesForBriefInput = z.object({
  briefId: z.string().uuid().describe('Brief to list candidates for.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max candidates to return (default 20).'),
});

export const listCandidatesForBriefConfig = {
  title: 'List candidates for a brief',
  description:
    'Returns the candidates (people) linked to a brief, newest first. Each candidate has a `status` field (discovered / pending_review / approved / contacted / scheduled / interviewed / rejected). Use `approve_candidate` or `reject_candidate` to advance items in `pending_review`. Use `get_contact` to see the full person behind each contactId.',
  inputSchema: listCandidatesForBriefInput.shape,
};

type Input = z.infer<typeof listCandidatesForBriefInput>;

export function makeListCandidatesForBriefHandler(client: ApiClient) {
  return async (args: Input) => {
    const limit = args.limit ?? 20;
    const list = await client.listCandidatesForBrief(args.briefId, limit);

    if (list.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No candidates yet for brief ${args.briefId}. Run \`find_candidates\` to discover some.`,
          },
        ],
      };
    }

    const payload = list.map((c) => ({
      candidateId: c.id,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      createdAt: c.createdAt.toISOString(),
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
