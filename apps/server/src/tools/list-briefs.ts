import { z } from 'zod';
import { listBriefsByOwner } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import type { Tool } from './types';

const inputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

type Output = Array<{
  briefId: string;
  productName: string;
  companyName: string;
  industry: string;
  objective: string;
  questionCount: number;
  status: 'draft' | 'active';
  createdAt: string;
  interviewUrl: string;
}>;

export const listBriefsTool: Tool<z.infer<typeof inputSchema>, Output> = {
  name: 'list_briefs',
  description:
    'Returns the research briefs the current user owns, newest first. Each item includes companyName + industry + questionCount + the public `interviewUrl` (`/interview/<briefId>`) for sharing.',
  inputSchema,
  async execute(args, ctx): Promise<Output> {
    const briefs = await listBriefsByOwner(ctx.supabase, ctx.userId, args.limit ?? 20);
    return briefs.map((b) => ({
      briefId: b.id,
      productName: b.researchContext.product?.name ?? '',
      companyName: b.researchContext.company?.name ?? '',
      industry: b.researchContext.company?.industry ?? '',
      objective: b.researchContext.research?.objective ?? '',
      questionCount: b.researchContext.research?.questions?.length ?? 0,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, b.id),
    }));
  },
};
