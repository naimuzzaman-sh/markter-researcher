import { z } from 'zod';
import { getCandidateWithOwner, updateCandidateStatus } from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getBriefById } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const rejectCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'reject_candidate',
  description:
    'Reject a candidate for this brief (status → rejected). The underlying contact stays in the org roster. Returns the updated candidate with embedded `contact` summary and `briefName`.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.briefOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const updated = await updateCandidateStatus(ctx.supabase, args.candidateId, 'rejected');
    if (!updated) throw new AppError('not_found', 'Candidate not found');

    const [contact, brief] = await Promise.all([
      getContactById(ctx.supabase, updated.contactId, ctx.userId),
      getBriefById(ctx.supabase, updated.briefId),
    ]);

    return {
      candidateId: updated.id,
      briefId: updated.briefId,
      briefName: brief?.researchContext.product?.name ?? null,
      contactId: updated.contactId,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      interviewUrl: buildInterviewUrl(
        ctx.config.webOrigin,
        updated.briefId,
        updated.id,
      ),
      contact: contact ? { id: contact.id, name: contact.name } : null,
    };
  },
};
