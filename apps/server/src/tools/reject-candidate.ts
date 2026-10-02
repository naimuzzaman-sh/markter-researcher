import { z } from 'zod';
import { getCandidateWithOwner, updateCandidateStatus } from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getStudyById } from '../db/studies';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const rejectCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'reject_candidate',
  description:
    'Reject a candidate for this study (status → rejected). The underlying contact stays in the org roster — a rejection here only severs the candidate ↔ study link. Returns the updated candidate with embedded `contact` summary and `studyName`.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.studyOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const updated = await updateCandidateStatus(ctx.supabase, args.candidateId, 'rejected');
    if (!updated) throw new AppError('not_found', 'Candidate not found');

    const [contact, study] = await Promise.all([
      getContactById(ctx.supabase, updated.contactId, ctx.userId),
      getStudyById(ctx.supabase, updated.studyId),
    ]);

    return {
      candidateId: updated.id,
      studyId: updated.studyId,
      studyName: study?.researchContext.product?.name ?? null,
      contactId: updated.contactId,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      interviewUrl: buildInterviewUrl(
        ctx.config.webOrigin,
        updated.studyId,
        updated.id,
      ),
      contact: contact ? { id: contact.id, name: contact.name } : null,
    };
  },
};
