import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactsService } from './contacts.service';
import type { SupabaseService } from './supabase.service';
import type { Contact } from './types/contact.type';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER_OWNER = '22222222-2222-2222-2222-222222222222';
const CONTACT_ID = '33333333-3333-3333-3333-333333333333';

const fakeContact: Contact = {
  id: CONTACT_ID,
  ownerId: OWNER,
  name: 'Ada Lovelace',
  linkedinUrl: 'https://linkedin.com/in/ada',
  title: 'Principal Engineer',
  companyName: 'Analytical Engines',
  companyDomain: 'analytical-engines.example',
  email: null,
  location: 'London',
  profileJson: { headline: 'math + machines' },
  researchNotes: null,
  embedding: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
};

describe('ContactsService', () => {
  let service: ContactsService;
  let persistence: SupabaseService;

  beforeEach(() => {
    persistence = {
      insertContact: vi.fn().mockResolvedValue(CONTACT_ID),
      upsertContactByLinkedIn: vi.fn().mockResolvedValue(fakeContact),
      getContactById: vi.fn().mockResolvedValue(fakeContact),
      listContactsByOwner: vi.fn().mockResolvedValue([fakeContact]),
      updateContactResearchNotes: vi.fn().mockResolvedValue(undefined),
    } as unknown as SupabaseService;
    service = new ContactsService(persistence);
  });

  describe('createContact', () => {
    it('inserts a new contact and returns its id', async () => {
      const { id } = await service.createContact({
        ownerId: OWNER,
        name: 'Ada Lovelace',
        linkedinUrl: 'https://linkedin.com/in/ada',
        title: 'Principal Engineer',
        companyName: 'Analytical Engines',
        companyDomain: 'analytical-engines.example',
        email: null,
        location: 'London',
        profileJson: { headline: 'math + machines' },
        researchNotes: null,
        embedding: null,
      });
      expect(id).toBe(CONTACT_ID);
      expect(persistence.insertContact).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: OWNER, name: 'Ada Lovelace' }),
      );
    });
  });

  describe('upsertByLinkedIn', () => {
    it('delegates to persistence and returns the (merged) contact', async () => {
      const contact = await service.upsertByLinkedIn({
        ownerId: OWNER,
        linkedinUrl: 'https://linkedin.com/in/ada',
        name: 'Ada Lovelace',
        title: 'Principal Engineer',
        companyName: 'Analytical Engines',
        companyDomain: 'analytical-engines.example',
        email: null,
        location: 'London',
        profileJson: { headline: 'updated' },
        embedding: null,
      });
      expect(contact.id).toBe(CONTACT_ID);
      expect(persistence.upsertContactByLinkedIn).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: OWNER,
          linkedinUrl: 'https://linkedin.com/in/ada',
        }),
      );
    });
  });

  describe('getContact', () => {
    it('returns a contact scoped to the requesting owner', async () => {
      const contact = await service.getContact(CONTACT_ID, OWNER);
      expect(contact?.id).toBe(CONTACT_ID);
    });

    it('returns null when contact is missing', async () => {
      persistence.getContactById = vi.fn().mockResolvedValue(null);
      expect(await service.getContact('missing', OWNER)).toBeNull();
    });

    it('returns null when contact belongs to a different owner', async () => {
      expect(await service.getContact(CONTACT_ID, OTHER_OWNER)).toBeNull();
    });
  });

  describe('listContacts', () => {
    it('delegates to persistence with owner + limit', async () => {
      const contacts = await service.listContacts(OWNER, 25);
      expect(persistence.listContactsByOwner).toHaveBeenCalledWith(OWNER, 25);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('appendResearchNotes', () => {
    it('passes notes through to persistence', async () => {
      await service.appendResearchNotes(CONTACT_ID, 'New findings.');
      expect(persistence.updateContactResearchNotes).toHaveBeenCalledWith(
        CONTACT_ID,
        'New findings.',
      );
    });
  });
});
