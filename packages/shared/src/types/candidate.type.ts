import { z } from 'zod';

const candidateStatusSchema = z.enum([
  'discovered',
  'pending_review',
  'approved',
  'contacted',
  'scheduled',
  'interviewed',
  'rejected',
]);

const candidateSourceSchema = z.enum(['discovery', 'manual', 'import']);

const briefCandidateSchema = z.object({
  id: z.string().uuid(),
  briefId: z.string().uuid(),
  contactId: z.string().uuid(),
  status: candidateStatusSchema,
  source: candidateSourceSchema,
  matchScore: z.number().min(0).max(1).nullable(),
  interviewId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

type CandidateStatus = z.infer<typeof candidateStatusSchema>;
type CandidateSource = z.infer<typeof candidateSourceSchema>;
type BriefCandidate = z.infer<typeof briefCandidateSchema>;

export { briefCandidateSchema, candidateStatusSchema, candidateSourceSchema };
export type { BriefCandidate, CandidateStatus, CandidateSource };
