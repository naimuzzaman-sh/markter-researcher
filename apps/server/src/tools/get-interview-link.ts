import { z } from 'zod';
import { studyBelongsToOwner } from '../db/candidates';
import { getCandidateWithOwner } from '../db/candidates';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({
  studyId: z.string().uuid(),
  /**
   * Optional. When supplied, the returned URL carries `?cid=<candidateId>`
   * so completed calls auto-attribute back to that candidate row.
   * Without it, the link is the public un-personalized variant.
   */
  candidateId: z.string().uuid().optional(),
});

/**
 * Lightweight URL builder for sharing an interview link without sending
 * an email. The cousin of `invite_candidate`: same URL shape, but no
 * Resend send and no `contacted` status flip — pure read.
 *
 * Why this exists separately from `get_study` / `get_candidate`:
 *   - Both already return the URL inline, but bring the rest of the
 *     entity along (heavy on tokens via MCP).
 *   - Researchers asking "give me the link" want exactly that —
 *     not a full study card or candidate dossier.
 *   - Lets MCP clients hand the URL to QR generators, Slack pastes,
 *     social posts, etc., without round-tripping through invite_candidate.
 */
export const getInterviewLinkTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_interview_link',
  description:
    "Build the public interview URL for a study. Pass `studyId` alone for the un-personalized link — share publicly (Slack, social, in-person). Pass `studyId` + `candidateId` for the personalized variant (`/interview/<studyId>?cid=<candidateId>`); completed calls auto-attribute back to that candidate. Returns `{ url }`. Lightweight and side-effect-free: no email sent, no candidate status flip — that's `invite_candidate`'s job. Owner-gated on the study (and the candidate when supplied).",
  inputSchema,
  async execute(args, ctx) {
    // Owner-gate the study.
    const owns = await studyBelongsToOwner(ctx.supabase, args.studyId, ctx.userId);
    if (!owns) throw new AppError('not_found', 'Study not found');

    // If candidateId is supplied, also verify it belongs to a study
    // owned by this user AND that the study match. We don't want to
    // mint a personalized URL for someone else's candidate.
    if (args.candidateId) {
      const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
      if (!row || row.studyOwnerId !== ctx.userId) {
        throw new AppError('not_found', 'Candidate not found');
      }
      if (row.candidate.studyId !== args.studyId) {
        throw new AppError(
          'validation',
          `Candidate ${args.candidateId} belongs to a different study.`,
        );
      }
    }

    const url = buildInterviewUrl(
      ctx.config.webOrigin,
      args.studyId,
      args.candidateId,
    );
    return { url };
  },
};
