import { z } from 'zod';
import { getBriefById } from '../db/briefs';
import { briefBelongsToOwner } from '../db/candidates';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ briefId: z.string().uuid() });

export const getBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_brief',
  description:
    'Fetch a research brief by id. Returns the full research context (company, product, target audience, questions, PMF hypothesis) plus `interviewUrl` (`/interview/<briefId>`) for sharing. Use after list_briefs to drill in.',
  inputSchema,
  async execute(args, ctx) {
    const owns = await briefBelongsToOwner(ctx.supabase, args.briefId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Brief not found');
    const brief = await getBriefById(ctx.supabase, args.briefId);
    if (!brief) throw new AppError('not_found', 'Brief not found');
    return {
      briefId: brief.id,
      researchContext: brief.researchContext,
      createdAt: brief.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, brief.id),
    };
  },
};
