import { z } from 'zod';
import { getContactById } from '../db/contacts';
import { AppError } from '../lib/errors';
import type { Tool } from './types';

const inputSchema = z.object({ contactId: z.string().uuid() });

export const getContactTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'get_contact',
  description:
    'Fetch one contact with full profile (name, title, company, LinkedIn URL, research notes, raw profile snapshot). Embedding vector is intentionally omitted.',
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
