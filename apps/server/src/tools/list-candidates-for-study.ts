import { z } from 'zod';
import {
  studyBelongsToOwner,
  listCandidatesForStudyWithContact,
} from '../db/candidates';
import { getStudyById } from '../db/studies';
import { buildInterviewUrl } from '../lib/interview-url';
import type { Tool } from './types';

const inputSchema = z.object({
  studyId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
});

export const listCandidatesForStudyTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_candidates_for_study',
  description:
    "List candidates linked to a study. Returns `{ studyId, studyName, candidates }`. Each candidate has `status` (discovered / pending_review / approved / contacted / scheduled / interviewed / rejected) plus an embedded contact summary (name, title, company, linkedinUrl). Sorted best-match first. Use `approve_candidate` / `reject_candidate` / `invite_candidate` to advance status. The top-level `studyName` is always populated (even when `candidates` is empty) so callers can reference the study by name without an extra lookup.",
  inputSchema,
  async execute(args, ctx) {
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) {
      return { studyId: args.studyId, studyName: null, candidates: [] };
    }

    // Ownership was enforced by `studyBelongsToOwner` above, so a plain
    // `getStudyById` here is safe.
    const [study, rows] = await Promise.all([
      getStudyById(ctx.supabase, args.studyId),
      listCandidatesForStudyWithContact(
        ctx.supabase,
        args.studyId,
        args.limit ?? 20,
      ),
    ]);

    const candidates = rows.map(({ candidate: c, contact }) => ({
      candidateId: c.id,
      studyId: c.studyId,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, c.studyId, c.id),
      contact,
    }));

    return {
      studyId: args.studyId,
      studyName: study?.researchContext.product?.name ?? null,
      candidates,
    };
  },
};
