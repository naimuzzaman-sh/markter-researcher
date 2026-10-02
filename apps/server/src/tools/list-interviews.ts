import { z } from 'zod';
import { listInterviewsByOwner } from '../db/interviews';
import { getStudyById } from '../db/studies';
import { studyBelongsToOwner } from '../db/candidates';
import type { Tool } from './types';

const inputSchema = z.object({
  studyId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const listInterviewsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_interviews',
  description:
    "Return completed interviews, newest first. Result is `{ studyId, studyName, interviews }`. When called with a `studyId`, `studyName` is the resolved name and the list is scoped to that study. When called without one, both top-level fields are null and `interviews` includes interviews across all studies (each item carries its own `studyName` and `contactName`). Each item has status + duration + overallSentiment but NOT the full transcript — use `get_interview` for that.",
  inputSchema,
  async execute(args, ctx) {
    // When a studyId is supplied, verify ownership before using the
    // unguarded `getStudyById` for the name lookup.
    const owns = args.studyId
      ? await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId)
      : false;
    const [study, rows] = await Promise.all([
      owns && args.studyId ? getStudyById(ctx.supabase, args.studyId) : Promise.resolve(null),
      listInterviewsByOwner(ctx.supabase, ctx.userId, args.studyId, args.limit ?? 50),
    ]);

    return {
      studyId: args.studyId ?? null,
      studyName: study?.researchContext.product?.name ?? null,
      interviews: rows.map((r) => ({
        interviewId: r.interviewId,
        studyId: r.studyId,
        studyName: r.studyName,
        contactName: r.contactName,
        status: r.status,
        durationSecs: r.durationSecs,
        overallSentiment: r.overallSentiment,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      })),
    };
  },
};
