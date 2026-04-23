import { z } from 'zod';
import { getInterviewById } from '../db/interviews';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ interviewId: z.string().uuid() });

export const getInterviewTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_interview',
  description:
    'Fetch a single completed interview with full transcript + per-question analysis + PMF signals. Returns 404 for missing or not-owned.',
  inputSchema,
  async execute(args, ctx) {
    const interview = await getInterviewById(ctx.supabase, args.interviewId, ctx.userId);
    if (!interview) throw new AppError('not_found', 'Interview not found');
    return {
      interviewId: interview.interviewId,
      briefId: interview.briefId,
      status: interview.status,
      transcript: interview.transcript,
      analysis: interview.analysis,
      durationSecs: interview.durationSecs,
      completedAt: interview.completedAt ? interview.completedAt.toISOString() : null,
    };
  },
};
