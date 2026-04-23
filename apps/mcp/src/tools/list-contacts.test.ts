import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../api-client.js';
import type { Contact } from '@market-researcher/shared';
import { makeListContactsHandler } from './list-contacts.js';

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listContacts: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const fakeContact: Contact = {
  id: 'c-1',
  ownerId: '',
  name: 'Ada Lovelace',
  linkedinUrl: 'https://linkedin.com/in/ada',
  title: 'Principal Engineer',
  companyName: 'Analytical Engines',
  companyDomain: null,
  email: null,
  location: 'London',
  profileJson: null,
  researchNotes: null,
  embedding: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
};

describe('list_contacts tool', () => {
  it('defaults limit to 20', async () => {
    const client = makeClient({
      listContacts: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListContactsHandler(client);
    await handler({});
    expect(client.listContacts).toHaveBeenCalledWith(20);
  });

  it('projects to the wire shape', async () => {
    const client = makeClient({
      listContacts: vi.fn().mockResolvedValue([fakeContact]),
    });
    const handler = makeListContactsHandler(client);
    const result = await handler({});
    const payload = JSON.parse(result.content[0].text);
    expect(payload[0].contactId).toBe('c-1');
    expect(payload[0].name).toBe('Ada Lovelace');
  });

  it('returns a helpful message when no contacts exist', async () => {
    const client = makeClient({
      listContacts: vi.fn().mockResolvedValue([]),
    });
    const handler = makeListContactsHandler(client);
    const result = await handler({});
    expect(result.content[0].text).toMatch(/no contacts yet/i);
  });
});
