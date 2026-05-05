import { studyPatchSchema, researchContextSchema } from '@mirrars/shared';
import { z } from 'zod';
import { getStudyById } from '../db/studies';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

/**
 * Accepts EITHER:
 *   • `studyId`  — fetch the current draft study and present its
 *     in-progress research context. Right path during the iterative
 *     draft flow ("show the user what we have so far").
 *   • `context`  — validate a candidate context not yet persisted.
 *     Legacy one-shot flow path.
 *
 * Strict / partial validation differs by path: `context` mode runs full
 * researchContextSchema validation (catches typos before save); studyId
 * mode is permissive (a draft might be partial and that's fine — preview
 * is for showing state, not gating it).
 */
const inputSchema = z
  .object({
    studyId: z.string().uuid().optional(),
    context: studyPatchSchema.optional(),
  })
  .refine(
    (v) => v.studyId !== undefined || v.context !== undefined,
    { message: 'Pass either studyId (to preview a saved draft) or context (to preview unsaved input)' },
  );

export const previewStudyTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'preview_study',
  description:
    "Show a study without committing changes. Pass `studyId` to preview a saved draft (most common path: after iteratively layering update_study patches onto a draft, present the assembled state for user confirmation). Pass `context` to preview unsaved input (legacy one-shot flow). Returns the same wire shape as `get_study`. **PRECONDITION:** before calling this, ensure the study has ALL required fields populated — company (name/industry/description), product (name/description/keyFeatures + a THICK structured `icp`: audience/problem/≥3 concrete attributes), research (objective + 5–8 questions + concerns + PMF hypothesis + signals), and interviewSettings (duration/tone/language). A thin ICP will block downstream `find_candidates` even after promotion. Showing a half-empty preview is broken UX — the user can't promote it (server rejects on incomplete schema) and the conversation loops. If fields are missing, either ask the user (for input fields like company description) OR draft them yourself (questions, signals, concerns, settings — those are YOUR job, not the user's). After the user confirms, promote with `update_study({ studyId, status: 'active' })`. Loose affirmations like 'yes', 'looks good', 'create it' count as full confirmation — advance, don't re-ask.",
  inputSchema,
  async execute(args, ctx) {
    if (args.studyId) {
      const study = await getStudyById(ctx.supabase, args.studyId);
      if (!study) throw new AppError('not_found', 'Study not found');
      return {
        studyId: study.id,
        researchContext: study.researchContext,
        status: study.status,
        createdAt: study.createdAt.toISOString(),
        interviewUrl: null,
        preview: true,
      };
    }
    // context-mode: validate strictly so the legacy path keeps catching
    // typos / missing fields before save.
    const validated = researchContextSchema.parse(args.context);
    return {
      studyId: null,
      researchContext: validated,
      status: 'draft' as const,
      createdAt: null,
      interviewUrl: null,
      preview: true,
    };
  },
};
