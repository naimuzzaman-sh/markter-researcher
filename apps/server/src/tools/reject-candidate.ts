import { z } from 'zod';
import { getCandidateWithOwner, updateCandidateStatus } from '../db/candidates';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const rejectCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'reject_candidate',
  description:
    'Reject a candidate for this brief. The underlying contact stays in the org roster and may surface for other briefs.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.briefOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const updated = await updateCandidateStatus(ctx.supabase, args.candidateId, 'rejected');
    if (!updated) throw new AppError('not_found', 'Candidate not found');
    return {
      candidateId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
