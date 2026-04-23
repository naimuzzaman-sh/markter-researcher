import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBriefById } from '../db/briefs';
import { AppError } from '../lib/errors';

/**
 * Public brief read — no auth. Interviewees visit
 * `https://app/interview/<briefId>` and the page hits this endpoint to load
 * the research context so the Convai session can be set up with the right
 * prompt on their behalf.
 */
export function createBriefsPublicRoute(deps: { supabase: SupabaseClient }) {
  return new Hono().get('/briefs/:id', async (c) => {
    const id = c.req.param('id');
    const brief = await getBriefById(deps.supabase, id);
    if (!brief) throw new AppError('not_found', 'Brief not found');
    return c.json({
      briefId: brief.id,
      researchContext: brief.researchContext,
      createdAt: brief.createdAt.toISOString(),
    });
  });
}
