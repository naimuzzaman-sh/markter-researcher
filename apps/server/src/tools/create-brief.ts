import {
  briefPatchSchema,
  researchContextSchema,
  type ResearchContext,
} from '@mirrars/shared';
import { z } from 'zod';
import { getBriefById, insertBrief } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

// Create accepts a partial context — `briefPatchSchema` is exactly the
// "every field optional, every subtree optional" shape we need for
// in-progress drafts. The legacy one-shot pattern (full context in
// one call) still works because a fully-populated payload is also a
// valid partial.
const inputSchema = z.object({
  context: briefPatchSchema,
});

export const createBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'create_brief',
  description:
    "Create a brief. Pass whatever you know — company, product, research, interviewSettings; each can be partial. The brief is saved as `status='draft'` until every field is concrete; if your initial payload happens to satisfy the full schema (the legacy one-shot path), the brief is created `active` directly. Returns `briefId` so subsequent `update_brief` calls can fill in remaining fields, then promote via `update_brief({ status: 'active' })` after `preview_brief` is confirmed by the user.",
  inputSchema,
  async execute(args, ctx) {
    // Try strict validation: if the agent dropped a complete context
    // in one call, create as active so the existing flow keeps working.
    // Otherwise we land in the new draft flow.
    const strict = researchContextSchema.safeParse(args.context);
    const status = strict.success ? 'active' : 'draft';

    const id = await insertBrief(ctx.supabase, {
      context: args.context as Partial<ResearchContext>,
      ownerId: ctx.userId,
      status,
    });
    const brief = await getBriefById(ctx.supabase, id);
    if (!brief) throw new AppError('internal', 'Brief saved but could not be reloaded');
    return {
      briefId: brief.id,
      researchContext: brief.researchContext,
      status: brief.status,
      createdAt: brief.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, brief.id),
    };
  },
};
