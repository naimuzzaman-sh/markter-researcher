import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { Contact } from '@market-researcher/shared';
import { makeGetContactHandler } from './get-contact.js';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

describe('get_contact tool', () => {
  it('returns the contact shape', async () => {
    const fakeContact: Contact = {
      id: CONTACT_ID,
      ownerId: '',
      name: 'Ada Lovelace',
      linkedinUrl: 'https://linkedin.com/in/ada',
      title: 'Principal Engineer',
      companyName: 'Analytical Engines',
      companyDomain: null,
      email: null,
      location: 'London',
      profileJson: { rawTitle: 'Ada Lovelace - Principal Engineer | LinkedIn' },
      researchNotes: null,
      embedding: null,
      createdAt: new Date('2026-04-20T10:00:00Z'),
      updatedAt: new Date('2026-04-20T10:00:00Z'),
    };
    const client = {
      getContact: vi.fn().mockResolvedValue(fakeContact),
    } as unknown as ApiClient;

    const handler = makeGetContactHandler(client);
    const result = await handler({ contactId: CONTACT_ID });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.contactId).toBe(CONTACT_ID);
    expect(payload.name).toBe('Ada Lovelace');
    expect(payload.companyName).toBe('Analytical Engines');
  });

  it('returns a helpful message when the contact is missing', async () => {
    const client = {
      getContact: vi.fn().mockResolvedValue(null),
    } as unknown as ApiClient;
    const handler = makeGetContactHandler(client);
    const result = await handler({ contactId: CONTACT_ID });
    expect(result.content[0].text).toMatch(/not found/);
  });
});
