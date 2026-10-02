import { z } from 'zod';
import { getCandidateWithOwner } from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getStudyById } from '../db/studies';
import { buildInterviewUrl } from '../lib/interview-url';
import { extractHighlightsFromProfileJson } from '../lib/highlights';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

export const getCandidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_candidate',
  description:
    'Fetch a single candidate (study ↔ contact link) by id. Returns the candidate plus a denormalized `contact` summary (name / title / company / email / researchNotes / linkedinUrl), `studyName`, and per-query `highlights` excerpts ("why this match") pulled from the discovery job. Lets callers render the full profile without follow-up lookups.',
  inputSchema,
  async execute(args, ctx) {
    const row = await getCandidateWithOwner(ctx.supabase, args.candidateId);
    if (!row || row.studyOwnerId !== ctx.userId) {
      throw new AppError('not_found', 'Candidate not found');
    }
    const c = row.candidate;

    // Parallel fetch — both already owner-gated upstream (candidate via
    // studyOwnerId, contact via owner_id).
    const [contact, study] = await Promise.all([
      getContactById(ctx.supabase, c.contactId, ctx.userId),
      getStudyById(ctx.supabase, c.studyId),
    ]);

    return {
      candidateId: c.id,
      studyId: c.studyId,
      studyName: study?.researchContext.product?.name ?? null,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, c.studyId, c.id),
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
