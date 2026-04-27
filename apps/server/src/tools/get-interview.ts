import { z } from 'zod';
import { getInterviewById } from '../db/interviews';
import { getBriefById } from '../db/briefs';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ interviewId: z.string().uuid() });

export const getInterviewTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_interview',
  description:
    'Fetch a single completed interview with full transcript + per-question analysis + PMF signals. Includes `briefName` and `contactName` resolved through the brief and the matching brief_candidate. Returns 404 for missing or not-owned.',
  inputSchema,
  async execute(args, ctx) {
    const interview = await getInterviewById(ctx.supabase, args.interviewId, ctx.userId);
    if (!interview) throw new AppError('not_found', 'Interview not found');

    // Brief is owner-gated by the interview itself (interviews join briefs
    // by inner-join on owner_id), so a plain getBriefById is safe.
    const brief = interview.briefId
      ? await getBriefById(ctx.supabase, interview.briefId)
      : null;

    // Contact name comes from the brief_candidate row that points at this
    // interview. Use the supabase client directly — it's a one-shot lookup
    // and we don't need a dedicated db helper.
    let contactName: string | null = null;
    if (interview.interviewId) {
      const { data } = await ctx.supabase
        .from('brief_candidates')
        .select('contact:contacts(name)')
        .eq('interview_id', interview.interviewId)
        .maybeSingle();
      const joined = data as { contact: { name: string } | { name: string }[] | null } | null;
      const contact = joined?.contact;
      if (Array.isArray(contact)) {
        contactName = contact[0]?.name ?? null;
      } else if (contact) {
        contactName = contact.name;
      }
    }

    return {
      interviewId: interview.interviewId,
      briefId: interview.briefId,
      briefName: brief?.researchContext.product?.name ?? null,
      contactName,
      status: interview.status,
      transcript: interview.transcript,
      analysis: interview.analysis,
      durationSecs: interview.durationSecs,
      completedAt: interview.completedAt ? interview.completedAt.toISOString() : null,
    };
  },
};
