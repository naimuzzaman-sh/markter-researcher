import { z } from 'zod';

const agentJobKindSchema = z.enum(['discovery', 'research', 'outreach']);
const agentJobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
]);

const agentJobSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  kind: agentJobKindSchema,
  status: agentJobStatusSchema,
  inputJson: z.unknown(),
  outputJson: z.unknown().nullable(),
  error: z.string().nullable(),
  costUsd: z.number().nullable(),
  tokensUsed: z.number().int().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  createdAt: z.date(),
});

type AgentJobKind = z.infer<typeof agentJobKindSchema>;
type AgentJobStatus = z.infer<typeof agentJobStatusSchema>;
type AgentJob = z.infer<typeof agentJobSchema>;

export { agentJobSchema, agentJobKindSchema, agentJobStatusSchema };
export type { AgentJob, AgentJobKind, AgentJobStatus };
