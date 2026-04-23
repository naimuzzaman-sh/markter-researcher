import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const approveCandidateInput = z.object({
  candidateId: z.string().uuid().describe('Candidate to approve.'),
});

export const approveCandidateConfig = {
  title: 'Approve a discovered candidate',
  description:
    'Advances a candidate from `pending_review` (or any earlier status) to `approved`, meaning you\'ve confirmed they\'re a good fit for the interview. After approval the candidate is ready for the next step in the funnel (outreach in later phases; manual scheduling today).',
  inputSchema: approveCandidateInput.shape,
};

type Input = z.infer<typeof approveCandidateInput>;

export function makeApproveCandidateHandler(client: ApiClient) {
  return async (args: Input) => {
    const c = await client.approveCandidate(args.candidateId);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              candidateId: c.id,
              status: c.status,
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
