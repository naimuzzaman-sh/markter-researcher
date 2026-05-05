import {
  studyPatchSchema,
  researchContextSchema,
  type ResearchContext,
} from '@mirrars/shared';
import { z } from 'zod';
import { getStudyById, insertStudy } from '../db/studies';
import { buildInterviewUrl } from '../lib/interview-url';
import { buildIcpSummary } from '../lib/icp';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

// Create accepts a partial context — `studyPatchSchema` is exactly the
// "every field optional, every subtree optional" shape we need for
// in-progress drafts. The legacy one-shot pattern (full context in
// one call) still works because a fully-populated payload is also a
// valid partial.
const inputSchema = z.object({
  context: studyPatchSchema,
});

export const createStudyTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'create_study',
  description:
    "Create a new research study. `context` accepts partial company/product/research/interviewSettings; each subtree is independently optional. **MINIMUM BAR before calling this tool: you must have at least the company name AND product name.** A bare 'create a study' / 'I want to start a study' with no specifics is NOT enough — ask the user for the company first; do NOT create an empty row that ends up titled 'Untitled study'. The study is saved as `status='draft'` while research_context is incomplete; a fully-populated payload (the legacy one-shot path) lands as `active` directly. Returns the new `studyId` — feed it to subsequent `update_study` calls to layer fields onto the draft, then promote via `update_study({ studyId, status: 'active' })` once the user confirms `preview_study`.",
  inputSchema,
  async execute(args, ctx) {
    // Auto-render ICP summary if the create payload includes one.
    // Same pattern as `update_study` — the human-readable label tracks
    // the structured fields automatically, no agent prompting required.
    const context = args.context as Partial<ResearchContext>;
    if (context.product?.icp) {
      const icp = context.product.icp;
      context.product = {
        ...context.product,
        icp: { ...icp, summary: buildIcpSummary(icp) },
      };
    }

    // Try strict validation: if the agent dropped a complete context
    // in one call, create as active so the existing flow keeps working.
    // Otherwise we land in the new draft flow.
    const strict = researchContextSchema.safeParse(context);
    const status = strict.success ? 'active' : 'draft';

    const id = await insertStudy(ctx.supabase, {
      context,
      ownerId: ctx.userId,
      status,
    });
    const study = await getStudyById(ctx.supabase, id);
    if (!study) throw new AppError('internal', 'Study saved but could not be reloaded');
    return {
      studyId: study.id,
      researchContext: study.researchContext,
      status: study.status,
      createdAt: study.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, study.id),
    };
  },
};
