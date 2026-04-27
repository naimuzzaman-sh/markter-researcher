import {
  briefPatchSchema,
  researchContextSchema,
  type BriefPatch,
  type ResearchContext,
} from '@mirrars/shared';
import { z } from 'zod';
import { getBriefById, updateBriefById } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid(),
  patch: briefPatchSchema,
});

/**
 * Shallow-merge a patch onto an existing ResearchContext.
 * Top-level subtrees (company/product/research/interviewSettings) merge field-by-field.
 * Array fields (questions, keyFeatures, concerns) are replaced atomically.
 * `research.productMarketFit` merges its own fields.
 */
function mergeContext(existing: ResearchContext, patch: BriefPatch): ResearchContext {
  return {
    company: patch.company ? { ...existing.company, ...patch.company } : existing.company,
    product: patch.product ? { ...existing.product, ...patch.product } : existing.product,
    research: patch.research
      ? {
          ...existing.research,
          ...patch.research,
          productMarketFit: patch.research.productMarketFit
            ? {
                ...existing.research.productMarketFit,
                ...patch.research.productMarketFit,
              }
            : existing.research.productMarketFit,
        }
      : existing.research,
    interviewSettings: patch.interviewSettings
      ? { ...existing.interviewSettings, ...patch.interviewSettings }
      : existing.interviewSettings,
  };
}

export const updateBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'update_brief',
  description:
    'Patch an existing brief. Accepts a partial `patch` — only top-level subtrees you pass are touched; arrays are replaced atomically. Validates the merged context against the full schema before saving. Returns the updated brief.',
  inputSchema,
  async execute(args, ctx) {
    const existing = await getBriefById(ctx.supabase, args.briefId);
    if (!existing) throw new AppError('not_found', 'Brief not found');

    const merged = mergeContext(existing.researchContext, args.patch);
    // Final defence — the patch alone can't guarantee the merged result is
    // valid, so re-validate the complete context before writing.
    const validated = researchContextSchema.parse(merged);

    const updated = await updateBriefById(ctx.supabase, args.briefId, ctx.userId, validated);
    if (!updated) throw new AppError('not_found', 'Brief not found');

    return {
      briefId: updated.id,
      researchContext: updated.researchContext,
      createdAt: updated.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, updated.id),
    };
  },
};
