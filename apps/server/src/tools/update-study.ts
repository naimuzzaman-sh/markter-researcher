import {
  studyPatchSchema,
  studyStatusSchema,
  researchContextSchema,
  type StudyPatch,
  type ResearchContext,
} from '@mirrars/shared';
import { z } from 'zod';
import { getStudyById, updateStudyById } from '../db/studies';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({
  studyId: z.string().uuid(),
  /** Partial patch onto researchContext. Fields not in the patch are left alone. */
  patch: studyPatchSchema.optional(),
  /**
   * Promote a draft → 'active' once preview_study is confirmed.
   * Setting `status: 'active'` triggers strict validation of the
   * MERGED research_context — incomplete drafts can't sneak through.
   * Demoting active → draft is allowed (e.g. user wants to keep
   * editing) but isn't a normal flow.
   */
  status: studyStatusSchema.optional(),
});

/**
 * Shallow-merge a patch onto a (possibly partial) ResearchContext.
 * Top-level subtrees (company/product/research/interviewSettings) merge field-by-field.
 * Array fields (questions, keyFeatures, concerns) are replaced atomically.
 * `research.productMarketFit` merges its own fields.
 *
 * Tolerant of missing existing subtrees — if `existing.company` is
 * undefined (draft study) and the patch has `company`, the result is
 * just the patch fields. Spread-of-undefined is a no-op, so this works
 * cleanly without explicit guards.
 */
function mergeContext(
  existing: Partial<ResearchContext>,
  patch: StudyPatch,
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

export const updateStudyTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'update_study',
  description:
    "Patch an existing study and/or promote its lifecycle status. `patch` accepts a partial researchContext — only top-level subtrees (company / product / research / interviewSettings) you pass are touched; arrays (questions, concerns, signals, keyFeatures) replace atomically. `status: 'active'` promotes a draft to active and triggers strict validation of the merged context (the study must be fully populated to promote — incomplete drafts get rejected with a list of missing fields). Returns the updated study with the same wire shape as `get_study`. **NEVER call this tool without an actual patch or status change.** If the user just clicked 'Edit study' or asked to view, do NOT fire update_study with an empty patch and do NOT claim 'I've updated the study' in your reply — that's a phantom update that erodes trust. Wait for actual new information.",
  inputSchema,
  async execute(args, ctx) {
    const existing = await getStudyById(ctx.supabase, args.studyId);
    if (!existing) {
      // Include the offending studyId in the error so the agent can
      // self-correct on retry — generic "Study not found" gives it
      // nothing to learn from. Common cause: the agent picked a stale
      // id from `artifactRef.entities` instead of the most recent
      // create_study / update_study result.
      throw new AppError(
        'not_found',
        `Study not found (studyId=${args.studyId}). Use the studyId from your most recent create_study or get_study result, not an older id in scope.`,
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
          `Can't promote study to active — context still has gaps: ${issues}`,
        );
      }
    }

    const updated = await updateStudyById(ctx.supabase, args.studyId, ctx.userId, {
      context: args.patch ? merged : undefined,
      status: args.status,
    });
    if (!updated) throw new AppError('not_found', 'Study not found');

    return {
      studyId: updated.id,
      researchContext: updated.researchContext,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, updated.id),
    };
  },
};
