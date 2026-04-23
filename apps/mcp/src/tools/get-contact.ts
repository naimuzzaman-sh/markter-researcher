import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export const getContactInput = z.object({
  contactId: z.string().uuid().describe('Contact id.'),
});

export const getContactConfig = {
  title: 'Get a contact',
  description:
    'Returns the full profile for one contact (person). Includes name, title, company, LinkedIn URL, research notes (if any), and the raw EXA profile snapshot in `profileJson`. Use this after `list_candidates_for_brief` to see the person behind a candidacy.',
  inputSchema: getContactInput.shape,
};

type Input = z.infer<typeof getContactInput>;

export function makeGetContactHandler(client: ApiClient) {
  return async (args: Input) => {
    const c = await client.getContact(args.contactId);
    if (!c) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Contact ${args.contactId} not found.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
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
            },
            null,
            2,
          ),
        },
      ],
    };
  };
}
