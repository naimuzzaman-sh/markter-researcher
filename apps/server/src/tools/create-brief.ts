import { researchContextSchema } from '@mirrars/shared';
import { z } from 'zod';
import { getBriefById, insertBrief } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({
  context: researchContextSchema,
});

export const createBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'create_brief',
  description:
    'Persist a research brief. Call AFTER `preview_brief` confirms the context is complete and the user has explicitly approved. Returns the full saved brief shape (`briefId`, `researchContext`, `createdAt`, `interviewUrl`) so the client can render the brief detail card without a follow-up fetch.',
  inputSchema,
  async execute(args, ctx) {
    const id = await insertBrief(ctx.supabase, args.context, ctx.userId);
    const brief = await getBriefById(ctx.supabase, id);
    if (!brief) throw new AppError('internal', 'Brief saved but could not be reloaded');
    return {
      briefId: brief.id,
      researchContext: brief.researchContext,
      createdAt: brief.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, brief.id),
    };
  },
};
