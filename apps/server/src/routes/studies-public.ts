import { Hono } from 'hono';
import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStudyById } from '../db/studies';
import { AppError } from '../lib/errors';

/**
 * Public study read — no auth. Interviewees visit
 * `https://app/interview/<studyId>` and the page hits this endpoint to load
 * the research context so the Convai session can be set up with the right
 * prompt on their behalf.
 *
 * Two URL paths point at the SAME handler:
 *   GET /studies/:id  — current canonical path
 *   GET /briefs/:id   — legacy alias. Existing invite emails in the wild
 *                       carry `/briefs/<id>` URLs (the public-route prefix
 *                       was renamed alongside the brief→study rename).
 *                       Keeping the alias so old invites don't 404 until
 *                       those campaigns wind down.
 */
export function createStudiesPublicRoute(deps: { supabase: SupabaseClient }) {
  const handler = async (c: Context<Record<string, never>, '/:id'>) => {
    const id = c.req.param('id');
    const study = await getStudyById(deps.supabase, id);
    if (!study) throw new AppError('not_found', 'Study not found');
    return c.json({
      studyId: study.id,
      researchContext: study.researchContext,
      createdAt: study.createdAt.toISOString(),
    });
  };

  return new Hono()
    .get('/studies/:id', handler)
    // Legacy alias — see file-level comment.
    .get('/briefs/:id', handler);
}
