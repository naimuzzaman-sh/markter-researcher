import {
  briefPatchSchema,
  briefStatusSchema,
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
  /** Partial patch onto researchContext. Fields not in the patch are left alone. */
  patch: briefPatchSchema.optional(),
  /**
   * Promote a draft → 'active' once preview_brief is confirmed.
   * Setting `status: 'active'` triggers strict validation of the
   * MERGED research_context — incomplete drafts can't sneak through.
   * Demoting active → draft is allowed (e.g. user wants to keep
   * editing) but isn't a normal flow.
   */
  status: briefStatusSchema.optional(),
});

/**
 * Shallow-merge a patch onto a (possibly partial) ResearchContext.
 * Top-level subtrees (company/product/research/interviewSettings) merge field-by-field.
 * Array fields (questions, keyFeatures, concerns) are replaced atomically.
 * `research.productMarketFit` merges its own fields.
 *
 * Tolerant of missing existing subtrees — if `existing.company` is
 * undefined (draft brief) and the patch has `company`, the result is
 * just the patch fields. Spread-of-undefined is a no-op, so this works
 * cleanly without explicit guards.
 */
function mergeContext(
  existing: Partial<ResearchContext>,
  patch: BriefPatch,
): Partial<ResearchContext> {
  return {
    company:
      patch.company || existing.company
        ? { ...(existing.company ?? {}), ...(patch.company ?? {}) }
        : undefined,
    product:
      patch.product || existing.product
        ? { ...(existing.product ?? {}), ...(patch.product ?? {}) }
        : undefined,
    research:
      patch.research || existing.research
        ? {
            ...(existing.research ?? {}),
            ...(patch.research ?? {}),
            productMarketFit: patch.research?.productMarketFit
              ? {
                  ...(existing.research?.productMarketFit ?? {}),
                  ...patch.research.productMarketFit,
                }
              : existing.research?.productMarketFit,
          }
        : undefined,
    interviewSettings:
      patch.interviewSettings || existing.interviewSettings
        ? {
            ...(existing.interviewSettings ?? {}),
            ...(patch.interviewSettings ?? {}),
          }
        : undefined,
  } as Partial<ResearchContext>;
}

export const updateBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'update_brief',
  description:
    "Patch an existing brief and/or promote its status. `patch` accepts a partial context — only top-level subtrees you pass are touched; arrays replace atomically. `status: 'active'` promotes a draft to active and triggers strict validation of the merged context (the brief must be fully populated to promote). Returns the updated brief.",
  inputSchema,
  async execute(args, ctx) {
    const existing = await getBriefById(ctx.supabase, args.briefId);
    if (!existing) {
      // Include the offending briefId in the error so the agent can
      // self-correct on retry — generic "Brief not found" gives it
      // nothing to learn from. Common cause: the agent picked a stale
      // id from `artifactRef.entities` instead of the most recent
      // create_brief / update_brief result.
      throw new AppError(
        'not_found',
        `Brief not found (briefId=${args.briefId}). Use the briefId from your most recent create_brief or get_brief result, not an older id in scope.`,
      );
    }

    const merged = args.patch
      ? mergeContext(existing.researchContext, args.patch)
      : existing.researchContext;

    const targetStatus = args.status ?? existing.status;

    // Promotion gate — never let an incomplete draft sneak into active.
    // If staying in draft, partial state is fine.
    if (targetStatus === 'active') {
      const strict = researchContextSchema.safeParse(merged);
      if (!strict.success) {
        const issues = strict.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .slice(0, 5)
          .join('; ');
        throw new AppError(
          'validation',
          `Can't promote brief to active — context still has gaps: ${issues}`,
        );
      }
    }

    const updated = await updateBriefById(ctx.supabase, args.briefId, ctx.userId, {
      context: args.patch ? merged : undefined,
      status: args.status,
    });
    if (!updated) throw new AppError('not_found', 'Brief not found');

    return {
      briefId: updated.id,
      researchContext: updated.researchContext,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, updated.id),
    };
  },
};
