import { z } from 'zod';
import { listInterviewsByOwner } from '../db/interviews';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const listInterviewsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_interviews',
  description:
    'Return completed interviews, newest first. Optional `briefId` narrows to one campaign. Each item has status + duration + overall sentiment but NOT the full transcript — use `get_interview` for that.',
  inputSchema,
  async execute(args, ctx) {
    const rows = await listInterviewsByOwner(
      ctx.supabase,
      ctx.userId,
      args.briefId,
      args.limit ?? 50,
    );
    return rows.map((r) => ({
      interviewId: r.interviewId,
      briefId: r.briefId,
      status: r.status,
      durationSecs: r.durationSecs,
      overallSentiment: r.overallSentiment,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    }));
  },
};
