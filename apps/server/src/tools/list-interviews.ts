import { z } from 'zod';
import { listInterviewsByOwner } from '../db/interviews';
import { getBriefById } from '../db/briefs';
import { briefBelongsToOwner } from '../db/candidates';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const listInterviewsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_interviews',
  description:
    'Return completed interviews, newest first. Result is `{ briefId, briefName, interviews }`. When called with a `briefId`, `briefName` is the resolved name and the list is scoped to that brief. When called without one, both top-level fields are null and `interviews` includes interviews across all briefs (each item carries its own `briefName` and `contactName`). Each item has status + duration + overall sentiment but NOT the full transcript — use `get_interview` for that.',
  inputSchema,
  async execute(args, ctx) {
    // When a briefId is supplied, verify ownership before using the
    // unguarded `getBriefById` for the name lookup.
    const owns = args.briefId
      ? await briefBelongsToOwner(ctx.supabase, args.briefId, ctx.userId)
      : false;
    const [brief, rows] = await Promise.all([
      owns && args.briefId ? getBriefById(ctx.supabase, args.briefId) : Promise.resolve(null),
      listInterviewsByOwner(ctx.supabase, ctx.userId, args.briefId, args.limit ?? 50),
    ]);

    return {
      briefId: args.briefId ?? null,
      briefName: brief?.researchContext.product?.name ?? null,
      interviews: rows.map((r) => ({
        interviewId: r.interviewId,
        briefId: r.briefId,
        briefName: r.briefName,
        contactName: r.contactName,
        status: r.status,
        durationSecs: r.durationSecs,
        overallSentiment: r.overallSentiment,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      })),
    };
  },
};
