import { z } from 'zod';
import { researchContextSchema } from './research-context.type';
import { callAnalysisSchema } from './call-analysis.type';

const savedTranscriptEntrySchema = z.object({
  role: z.enum(['user', 'agent']),
  message: z.string(),
  timeInCallSecs: z.number().int().nonnegative(),
});

const savedInterviewSchema = z.object({
  callId: z.string().min(1),
  agentId: z.string().min(1),
  briefId: z.string().min(1),
  conversationId: z.string().nullable(),
  status: z.enum(['completed', 'failed']),
  researchContext: researchContextSchema,
  transcript: z.array(savedTranscriptEntrySchema),
  analysis: callAnalysisSchema.nullable(),
  durationSecs: z.number().int().nonnegative().nullable(),
  completedAt: z.date().nullable(),
});

type SavedInterview = z.infer<typeof savedInterviewSchema>;

/**
 * Lightweight summary used for list views (MCP `list_interviews`, web dashboard).
 * Omits transcript + full analysis payload to keep list responses small.
 * `overallSentiment` is pulled out of analysis for quick at-a-glance triage.
 */
type InterviewSummary = {
  interviewId: string;
  briefId: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  overallSentiment: 'positive' | 'neutral' | 'negative' | null;
  completedAt: Date | null;
};

/**
 * Detail view for MCP `get_interview` and the web interview detail page.
 * Excludes callId, agentId, conversationId, researchContext (fetched via the
 * brief when needed) to keep the payload focused on what reviewers look at.
 */
type InterviewDetail = {
  interviewId: string;
  briefId: string | null;
  status: 'completed' | 'failed';
  transcript: SavedInterview['transcript'];
  analysis: SavedInterview['analysis'];
  durationSecs: number | null;
  completedAt: Date | null;
};

export { savedInterviewSchema };
export type { SavedInterview, InterviewSummary, InterviewDetail };
