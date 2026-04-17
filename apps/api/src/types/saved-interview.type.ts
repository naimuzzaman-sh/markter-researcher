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
  conversationId: z.string().nullable(),
  status: z.enum(['completed', 'failed']),
  researchContext: researchContextSchema,
  transcript: z.array(savedTranscriptEntrySchema),
  analysis: callAnalysisSchema.nullable(),
  durationSecs: z.number().int().nonnegative().nullable(),
  completedAt: z.date().nullable(),
});

type SavedInterview = z.infer<typeof savedInterviewSchema>;

export { savedInterviewSchema };
export type { SavedInterview };
