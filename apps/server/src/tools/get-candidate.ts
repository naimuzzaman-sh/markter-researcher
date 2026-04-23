import { z } from 'zod';
import { getCandidateWithOwner } from '../db/candidates';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const getCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_candidate',
  description:
    'Fetch a single candidate (brief ↔ contact link) by id. Use after list_candidates_for_brief to inspect the funnel status or link to the underlying contact.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.briefOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const c = row.candidate;
    return {
      candidateId: c.id,
      briefId: c.briefId,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  },
};
