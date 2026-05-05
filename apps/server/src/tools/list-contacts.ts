import { z } from 'zod';
import { listContactsByOwner } from '../db/contacts';
import type { Tool } from './types';

const inputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

export const listContactsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_contacts',
  description:
    "List the current user's contacts (people who could be interviewed), newest first. Each item is a summary: contactId, name, title, companyName/companyDomain, linkedinUrl, email, location, createdAt. Contacts are org-wide and outlive any single study — the same person can appear as a candidate across multiple studies. Default limit 20, max 100. Use `get_contact` for the full profile snapshot, or `get_candidate` if you want the candidate-side view (status, study link, matchScore).",
  inputSchema,
  async execute(args, ctx) {
    const contacts = await listContactsByOwner(ctx.supabase, ctx.userId, args.limit ?? 20);
    return contacts.map((c) => ({
      contactId: c.id,
      name: c.name,
      title: c.title,
      companyName: c.companyName,
      companyDomain: c.companyDomain,
      linkedinUrl: c.linkedinUrl,
      email: c.email,
      location: c.location,
      createdAt: c.createdAt.toISOString(),
    }));
  },
};
