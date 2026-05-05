import { z } from 'zod';
import {
  getCandidateWithOwner,
  updateCandidateStatus,
} from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getStudyById } from '../db/studies';
import { sendInterviewInvite } from '../external/resend';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const inviteCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'invite_candidate',
  description:
    "Send an interview invite email to a candidate via Resend. Loads the candidate, contact, and study; constructs the candidate-tagged interview URL (`/interview/<studyId>?cid=<candidateId>`); sends a short plain-text email with the researcher's email as Reply-To; flips status to `contacted`. Refuses to send if the contact has no email, has previously hard-bounced, has marked us as spam, or has unsubscribed — surfaces a clear error in those cases.",
  inputSchema,
  async execute(args, ctx) {
    // Owner-gate via candidate → study join.
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.studyOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const candidate = row.candidate;

    // Idempotency: candidate is already past 'approved' → don't re-send.
    // The pill in the UI is hidden for non-approved statuses, but the
    // chat-driven path could still re-trigger; better to short-circuit
    // here than spam the recipient.
    if (
      candidate.status === 'contacted' ||
      candidate.status === 'scheduled' ||
      candidate.status === 'interviewed'
    ) {
      throw new AppError(
        'validation',
        `This candidate has already been invited (status: ${candidate.status}).`,
      );
    }

    const [contact, study] = await Promise.all([
      getContactById(ctx.supabase, candidate.contactId, ctx.userId),
      getStudyById(ctx.supabase, candidate.studyId),
    ]);

    if (!contact) throw new AppError('not_found', 'Contact not found');
    if (!contact.email) {
      throw new AppError(
        'validation',
        `${contact.name} doesn't have an email on file — add one before sending an invite.`,
      );
    }

    // Suppression: hard bounces and spam complaints are sticky. The
    // webhook handler set this state from a prior delivery attempt,
    // and re-sending would damage our sender reputation without
    // delivering anything.
    if (contact.emailStatus === 'bounced') {
      throw new AppError(
        'validation',
        `Skipped — ${contact.name}'s email previously hard-bounced${
          contact.emailStatusReason ? ` (${contact.emailStatusReason})` : ''
        }. Update or remove the address before retrying.`,
      );
    }
    if (contact.emailStatus === 'complained') {
      throw new AppError(
        'validation',
        `Skipped — ${contact.name} previously marked us as spam. We won't email them again.`,
      );
    }
    if (contact.emailStatus === 'unsubscribed') {
      throw new AppError(
        'validation',
        `Skipped — ${contact.name} unsubscribed from research invites.`,
      );
    }

    const productName = study?.researchContext.product?.name ?? 'a research interview';
    const interviewUrl = buildInterviewUrl(
      ctx.config.webOrigin,
      candidate.studyId,
      candidate.id,
    );

    await sendInterviewInvite({
      apiKey: ctx.config.resendApiKey,
      from: ctx.config.resendFromEmail,
      // Researcher's email when available (web flow); falls back to
      // `from` so replies at least don't bounce. MCP transport
      // currently passes null — see routes/mcp.ts.
      replyTo: ctx.userEmail ?? ctx.config.resendFromEmail,
      to: contact.email,
      productName,
      interviewUrl,
      // Stable per-candidate key — Resend dedupes if the user
      // somehow triggers two sends for the same candidate within
      // their idempotency window.
      idempotencyKey: `invite-${candidate.id}`,
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
      studyId: updated.studyId,
      studyName: study?.researchContext.product?.name ?? null,
      contactId: updated.contactId,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      interviewUrl,
      contact: { id: contact.id, name: contact.name, email: contact.email },
    };
  },
};
