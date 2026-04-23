import { z } from 'zod';
import { listBriefsByOwner } from '../db/briefs';
import type { Tool } from './types';

const inputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

type Output = Array<{
  briefId: string;
  productName: string;
  objective: string;
  createdAt: string;
}>;

export const listBriefsTool: Tool<z.infer<typeof inputSchema>, Output> = {
  name: 'list_briefs',
  description:
    'Returns the research briefs the current user owns, newest first. Each brief is an interview campaign template (questions, target audience, objective).',
  inputSchema,
  async execute(args, ctx): Promise<Output> {
    const briefs = await listBriefsByOwner(ctx.supabase, ctx.userId, args.limit ?? 20);
    return briefs.map((b) => ({
      briefId: b.id,
      productName: b.researchContext.product?.name ?? '',
      objective: b.researchContext.research?.objective ?? '',
      createdAt: b.createdAt.toISOString(),
    }));
  },
};
