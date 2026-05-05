import { briefPatchSchema, researchContextSchema } from '@mirrars/shared';
import { z } from 'zod';
import { getBriefById } from '../db/briefs';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

/**
 * Accepts EITHER:
 *   • `briefId`  — fetch the current draft brief and present its
 *     in-progress research context. Right path during the iterative
 *     draft flow ("show the user what we have so far").
 *   • `context`  — validate a candidate context not yet persisted.
 *     Legacy one-shot flow path.
 *
 * Strict / partial validation differs by path: `context` mode runs full
 * researchContextSchema validation (catches typos before save); briefId
 * mode is permissive (a draft might be partial and that's fine — preview
 * is for showing state, not gating it).
 */
const inputSchema = z
  .object({
    briefId: z.string().uuid().optional(),
    context: briefPatchSchema.optional(),
  })
  .refine(
    (v) => v.briefId !== undefined || v.context !== undefined,
    { message: 'Pass either briefId (to preview a saved draft) or context (to preview unsaved input)' },
  );

export const previewBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'preview_brief',
  description:
    'Show a brief without committing changes. Pass `briefId` to preview a saved draft (most common: after iteratively updating a draft, present the current state for user confirmation). Pass `context` to preview unsaved input (legacy one-shot flow). Returns the same shape as `get_brief`. After the user confirms, promote with `update_brief({ briefId, status: "active" })`.',
  inputSchema,
  async execute(args, ctx) {
    if (args.briefId) {
      const brief = await getBriefById(ctx.supabase, args.briefId);
      if (!brief) throw new AppError('not_found', 'Brief not found');
      return {
        briefId: brief.id,
        researchContext: brief.researchContext,
        status: brief.status,
        createdAt: brief.createdAt.toISOString(),
        interviewUrl: null,
        preview: true,
      };
    }
    // context-mode: validate strictly so the legacy path keeps catching
    // typos / missing fields before save.
    const validated = researchContextSchema.parse(args.context);
    return {
      briefId: null,
      researchContext: validated,
      status: 'draft' as const,
      createdAt: null,
      interviewUrl: null,
      preview: true,
    };
  },
};
