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

const studyCandidateSchema = z.object({
  id: z.string().uuid(),
  studyId: z.string().uuid(),
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
type StudyCandidate = z.infer<typeof studyCandidateSchema>;

export { studyCandidateSchema, candidateStatusSchema, candidateSourceSchema };
export type { StudyCandidate, CandidateStatus, CandidateSource };
