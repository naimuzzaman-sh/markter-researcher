import { z } from 'zod';
import { getInterviewById } from '../db/interviews';
import { getStudyById } from '../db/studies';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ interviewId: z.string().uuid() });

export const getInterviewTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_interview',
  description:
    "Fetch a single interview by id with the full transcript and analysis. Returns: `transcript` (turn-by-turn role + message + timeInCallSecs), `analysis` (participant role + background, per-question answers with sentiment, keyInsights, productMarketFitSignals, suggestedFollowUps, overallSentiment), `status` (completed | failed), `durationSecs`, `completedAt`, plus resolved `studyName` and `contactName` so the LLM can refer to either by name. `analysis` may be null on rare transient-Gemini failures — the transcript is still the authoritative record. For aggregated cross-interview synthesis, use `get_study({ studyId }).results` or `regenerate_study_results`.",
  inputSchema,
  async execute(args, ctx) {
    const interview = await getInterviewById(ctx.supabase, args.interviewId, ctx.userId);
    if (!interview) throw new AppError('not_found', 'Interview not found');

    // Study is owner-gated by the interview itself (interviews join studies
    // by inner-join on owner_id), so a plain getStudyById is safe.
    const study = interview.studyId
      ? await getStudyById(ctx.supabase, interview.studyId)
      : null;

    // Contact name comes from the study_candidate row that points at this
    // interview. Use the supabase client directly — it's a one-shot lookup
    // and we don't need a dedicated db helper.
    let contactName: string | null = null;
    if (interview.interviewId) {
      const { data } = await ctx.supabase
        .from('study_candidates')
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
      studyId: interview.studyId,
      studyName: study?.researchContext.product?.name ?? null,
      contactName,
      status: interview.status,
      transcript: interview.transcript,
      analysis: interview.analysis,
      durationSecs: interview.durationSecs,
      completedAt: interview.completedAt ? interview.completedAt.toISOString() : null,
    };
  },
};
