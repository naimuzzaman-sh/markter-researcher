import { z } from 'zod';
import {
  getCandidateWithOwner,
  updateCandidateStatus,
} from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getBriefById } from '../db/briefs';
import { sendInterviewInvite } from '../external/resend';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const inviteCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'invite_candidate',
  description:
    'Send an interview invite email to a candidate via Resend. Loads the candidate, contact, and brief; constructs the candidate-tagged interview URL (`/interview/<briefId>?cid=<candidateId>`); sends a short plain-text email; flips status to `contacted`. Throws if the contact has no email on file.',
  inputSchema,
  async execute(args, ctx) {
    // Owner-gate via candidate → brief join.
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.briefOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const candidate = row.candidate;

    const [contact, brief] = await Promise.all([
      getContactById(ctx.supabase, candidate.contactId, ctx.userId),
      getBriefById(ctx.supabase, candidate.briefId),
    ]);

    if (!contact) throw new AppError('not_found', 'Contact not found');
    if (!contact.email) {
      throw new AppError(
        'validation',
        `${contact.name} doesn't have an email on file — add one before sending an invite.`,
      );
    }

    const productName = brief?.researchContext.product?.name ?? 'a research interview';
    const interviewUrl = buildInterviewUrl(
      ctx.config.webOrigin,
      candidate.briefId,
      candidate.id,
    );

    await sendInterviewInvite({
      apiKey: ctx.config.resendApiKey,
      from: ctx.config.resendFromEmail,
      to: contact.email,
      productName,
      interviewUrl,
    });

    // Auto-flip to contacted now that the invite is out.
    const updated = await updateCandidateStatus(
      ctx.supabase,
      candidate.id,
      'contacted',
    );
    if (!updated) throw new AppError('internal', 'Failed to update candidate status');

    return {
      candidateId: updated.id,
      briefId: updated.briefId,
      briefName: brief?.researchContext.product?.name ?? null,
      contactId: updated.contactId,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      interviewUrl,
      contact: { id: contact.id, name: contact.name, email: contact.email },
    };
  },
};
