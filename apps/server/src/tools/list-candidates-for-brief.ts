import { z } from 'zod';
import {
  briefBelongsToOwner,
  listCandidatesForBriefWithContact,
} from '../db/candidates';
import { getBriefById } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
});

export const listCandidatesForBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_candidates_for_brief',
  description:
    'List candidates linked to a brief. Returns `{ briefId, briefName, candidates }`. Each candidate has `status` (discovered/pending_review/approved/contacted/scheduled/interviewed/rejected) plus an embedded contact summary (name/title/company/linkedinUrl). Use `approve_candidate` / `reject_candidate` to advance status. The top-level `briefName` is always present (even when `candidates` is empty) so callers can reference the brief by name without an extra lookup.',
  inputSchema,
  async execute(args, ctx) {
    const owns = await briefBelongsToOwner(ctx.supabase, args.briefId, ctx.userId);
    if (!owns) {
      return { briefId: args.briefId, briefName: null, candidates: [] };
    }

    // Ownership was enforced by `briefBelongsToOwner` above, so a plain
    // `getBriefById` here is safe.
    const [brief, rows] = await Promise.all([
      getBriefById(ctx.supabase, args.briefId),
      listCandidatesForBriefWithContact(
        ctx.supabase,
        args.briefId,
        args.limit ?? 20,
      ),
    ]);

    const candidates = rows.map(({ candidate: c, contact }) => ({
      candidateId: c.id,
      briefId: c.briefId,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, c.briefId, c.id),
      contact,
    }));

    return {
      briefId: args.briefId,
      briefName: brief?.researchContext.product?.name ?? null,
      candidates,
    };
  },
};
