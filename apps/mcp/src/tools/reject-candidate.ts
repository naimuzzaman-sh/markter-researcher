import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const rejectCandidateInput = z.object({
  candidateId: z.string().uuid().describe('Candidate to reject.'),
});

export const rejectCandidateConfig = {
  title: 'Reject a discovered candidate',
  description:
    'Marks a candidate as `rejected`, signalling you do NOT want to interview them for this brief. Rejection is scoped to this brief — the contact still exists and may be surfaced for other briefs later.',
  inputSchema: rejectCandidateInput.shape,
};

type Input = z.infer<typeof rejectCandidateInput>;

export function makeRejectCandidateHandler(client: ApiClient) {
  return async (args: Input) => {
    const c = await client.rejectCandidate(args.candidateId);
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
