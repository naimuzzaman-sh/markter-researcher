import { z } from 'zod';
import { getCandidateWithOwner } from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getBriefById } from '../db/briefs';
import { buildInterviewUrl } from '../lib/interview-url';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ candidateId: z.string().uuid() });

/**
 * Pull the per-query relevance excerpts that the discovery flow stashed
 * on `contacts.profile_json.highlights`. Defensive narrowing — older
 * rows may have any shape, and we never want a candidate detail to
 * crash because legacy data lacks this field.
 */
function extractHighlights(profileJson: unknown): string[] {
  if (!profileJson || typeof profileJson !== 'object') return [];
  const h = (profileJson as { highlights?: unknown }).highlights;
  if (!Array.isArray(h)) return [];
  return h.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

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
      // job (Exa highlights). Empty array when missing — UI treats that
      // as "no excerpts to render".
      highlights: contact ? extractHighlights(contact.profileJson) : [],
    };
  },
};
