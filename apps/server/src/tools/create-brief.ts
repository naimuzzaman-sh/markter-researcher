import { researchContextSchema } from '@mirrars/shared';
import { z } from 'zod';
import { insertBrief } from '../db/briefs';
import type { Tool } from './types';

const inputSchema = z.object({
  context: researchContextSchema,
});

export const createBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'create_brief',
  description:
    'Persist a research brief. Call this AFTER `preview_brief` confirms the context is complete and the user has explicitly approved. Returns `{ briefId }`.',
  inputSchema,
  async execute(args, ctx) {
    const id = await insertBrief(ctx.supabase, args.context, ctx.userId);
    return { briefId: id };
  },
};
