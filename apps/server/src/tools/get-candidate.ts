import { z } from 'zod';
import { getCandidateWithOwner } from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getBriefById } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import { extractHighlightsFromProfileJson } from '../lib/highlights';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const getCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_candidate',
  description:
    'Fetch a single candidate (brief ↔ contact link) by id. Returns the candidate plus a denormalized `contact` summary (name/title/company/email/researchNotes) and `briefName`, so callers can render the full profile without follow-up lookups.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.briefOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const c = row.candidate;

    // Parallel fetch — both already owner-gated upstream (candidate via
    // briefOwnerId, contact via owner_id).
    const [contact, brief] = await Promise.all([
      getContactById(ctx.supabase, c.contactId, ctx.userId),
      getBriefById(ctx.supabase, c.briefId),
    ]);

    return {
      candidateId: c.id,
      briefId: c.briefId,
      briefName: brief?.researchContext.product?.name ?? null,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, c.briefId, c.id),
      contact: contact
        ? {
            id: contact.id,
            name: contact.name,
            title: contact.title,
            companyName: contact.companyName,
            location: contact.location,
            email: contact.email,
            linkedinUrl: contact.linkedinUrl,
            researchNotes: contact.researchNotes,
          }
        : null,
      // "Why this candidate matches" excerpts pulled from the discovery
      // job (Exa highlights). Cleaned at read-time so legacy rows with
      // raw `[...]`-joined blobs render the same as fresh ones. Empty
      // array when missing — UI treats that as "no excerpts to render".
      highlights: contact
        ? extractHighlightsFromProfileJson(contact.profileJson)
        : [],
    };
  },
};
