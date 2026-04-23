import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const listContactsInput = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max contacts to return (default 20).'),
});

export const listContactsConfig = {
  title: 'List contacts',
  description:
    'Returns all contacts you own, newest first. Contacts are org-wide (not scoped to any single brief) — they accumulate as you discover people across briefs. Use `get_contact` to see the full profile of one.',
  inputSchema: listContactsInput.shape,
};

type Input = z.infer<typeof listContactsInput>;

export function makeListContactsHandler(client: ApiClient) {
  return async (args: Input) => {
    const limit = args.limit ?? 20;
    const contacts = await client.listContacts(limit);

    if (contacts.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'You have no contacts yet. Run `find_candidates` for a brief to discover some.',
          },
        ],
      };
    }

    const payload = contacts.map((c) => ({
      contactId: c.id,
      name: c.name,
      title: c.title,
      companyName: c.companyName,
      linkedinUrl: c.linkedinUrl,
      location: c.location,
      createdAt: c.createdAt.toISOString(),
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  };
}
