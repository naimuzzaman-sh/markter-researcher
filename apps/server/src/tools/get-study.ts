import { z } from 'zod';
import { getStudyById } from '../db/studies';
import { studyBelongsToOwner } from '../db/candidates';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ studyId: z.string().uuid() });

export const getStudyTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_study',
  description:
    "Fetch a study by id, including its `results` — the aggregated synthesis (themes, painPoints, pmfSignalsObserved, recommendations, summary, interviewCount, lastUpdated) computed across every completed interview. `results` is null until the first interview lands; use `regenerate_study_results` to force a refresh. Also returns the full `researchContext` (company, product, target audience, interview questions, PMF hypothesis, signals, concerns, interview settings), the lifecycle `status` (`draft` while being assembled / `active` after promotion), the persisted `chatHistory` (conversation that built or edits this study), and `interviewUrl` (`/interview/<studyId>`) for public sharing — for a personalized invite link, use `get_interview_link` with a candidateId.",
  inputSchema,
  async execute(args, ctx) {
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Study not found');
    const study = await getStudyById(ctx.supabase, args.studyId);
    if (!study) throw new AppError('not_found', 'Study not found');
    return {
      studyId: study.id,
      researchContext: study.researchContext,
      status: study.status,
      // Chat history rides on the detail wire shape so the AgentChat
      // shell can hydrate the conversation when the user resumes a
      // study via `/assistant?studyId=<id>`. Empty array on studies
      // that pre-date persistence.
      chatHistory: study.chatHistory,
      // Study-level synthesis across all completed interviews.
      // Null until the first interview lands. UI hides the RESULTS
      // section when null.
      results: study.results,
      createdAt: study.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, study.id),
    };
  },
};
