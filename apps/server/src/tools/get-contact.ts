import { z } from 'zod';
import { getContactById } from '../db/contacts';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ contactId: z.string().uuid() });

export const getContactTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_contact',
  description:
    "Fetch one contact by id. Contacts are people the researcher can interview — they live org-wide, independent of any single study (the same person can be a candidate for multiple studies). Returns name, title, companyName/companyDomain, linkedinUrl, email, location, researchNotes, and profileJson (the raw discovery snapshot incl. Exa highlights). The embedding vector is intentionally omitted (large + irrelevant to the LLM). Use after `list_contacts` or when the user references a contact by name. For the candidate-side view (status, matchScore, study link), use `get_candidate` instead.",
  inputSchema,
  async execute(args, ctx) {
    const c = await getContactById(ctx.supabase, args.contactId, ctx.userId);
    if (!c) throw new AppError('not_found', 'Contact not found');
    return {
      contactId: c.id,
      name: c.name,
      title: c.title,
      companyName: c.companyName,
      companyDomain: c.companyDomain,
      linkedinUrl: c.linkedinUrl,
      email: c.email,
      location: c.location,
      researchNotes: c.researchNotes,
      profileJson: c.profileJson,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  },
};
