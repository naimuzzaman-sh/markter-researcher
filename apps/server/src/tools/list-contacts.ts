import { z } from 'zod';
import { listContactsByOwner } from '../db/contacts';
import type { Tool } from './types';

const inputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

export const listContactsTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_contacts',
  description:
    'Return all contacts you own, newest first. Contacts are org-wide across all briefs. Use `get_contact` to drill into one.',
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
