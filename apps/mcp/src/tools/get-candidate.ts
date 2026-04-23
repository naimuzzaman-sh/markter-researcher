import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const getCandidateInput = z.object({
  candidateId: z.string().uuid().describe('Candidate id.'),
});

export const getCandidateConfig = {
  title: 'Get a candidate',
  description:
    'Returns a single candidate (brief ↔ contact link) by id. Use this when you already know the candidate id, e.g. from `list_candidates_for_brief`.',
  inputSchema: getCandidateInput.shape,
};

type Input = z.infer<typeof getCandidateInput>;

export function makeGetCandidateHandler(client: ApiClient) {
  return async (args: Input) => {
    const c = await client.getCandidate(args.candidateId);
    if (!c) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Candidate ${args.candidateId} not found.`,
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
              candidateId: c.id,
              briefId: c.briefId,
              contactId: c.contactId,
              status: c.status,
              source: c.source,
              matchScore: c.matchScore,
              interviewId: c.interviewId,
              createdAt: c.createdAt.toISOString(),
              updatedAt: c.updatedAt.toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    };
  };
}
