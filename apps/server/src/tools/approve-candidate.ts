import { z } from 'zod';
import { getCandidateWithOwner, updateCandidateStatus } from '../db/candidates';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const approveCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'approve_candidate',
  description:
    'Approve a candidate (typically from pending_review → approved). Signals the researcher is happy to interview this person.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.briefOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const updated = await updateCandidateStatus(ctx.supabase, args.candidateId, 'approved');
    if (!updated) throw new AppError('not_found', 'Candidate not found');
    return {
      candidateId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
