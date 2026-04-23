import { z } from 'zod';
import { briefBelongsToOwner, listCandidatesForBrief } from '../db/candidates';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
});

export const listCandidatesForBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_candidates_for_brief',
  description:
    'List candidates (people discovered or added manually) linked to a brief. Each has `status` (discovered/pending_review/approved/contacted/scheduled/interviewed/rejected). Use `approve_candidate` / `reject_candidate` to advance.',
  inputSchema,
  async execute(args, ctx) {
    const owns = await briefBelongsToOwner(ctx.supabase, args.briefId, ctx.userId);
    if (!owns) return [];
    const rows = await listCandidatesForBrief(ctx.supabase, args.briefId, args.limit ?? 20);
    return rows.map((c) => ({
      candidateId: c.id,
      briefId: c.briefId,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
    }));
  },
};
