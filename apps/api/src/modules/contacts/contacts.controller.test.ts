import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import type { ContactsService } from './contacts.service';
import type { Contact } from '@market-researcher/shared';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c-1',
  ownerId: FAKE_USER.id,
  name: 'Ada Lovelace',
  linkedinUrl: 'https://linkedin.com/in/ada',
  title: 'Principal Engineer',
  companyName: 'Analytical Engines',
  companyDomain: 'analytical-engines.example',
  email: null,
  location: 'London',
  profileJson: null,
  researchNotes: null,
  embedding: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
  ...overrides,
});

describe('ContactsController', () => {
  let controller: ContactsController;
  let service: ContactsService;

  beforeEach(() => {
    service = {
      getContact: vi.fn().mockResolvedValue(makeContact()),
      listContacts: vi
        .fn()
        .mockResolvedValue([makeContact(), makeContact({ id: 'c-2' })]),
    } as unknown as ContactsService;
    controller = new ContactsController(service);
  });

  describe('GET /contacts/:id', () => {
    it('returns the contact shape scoped to the caller', async () => {
      const result = await controller.getContact('c-1', FAKE_USER);
      expect(service.getContact).toHaveBeenCalledWith('c-1', FAKE_USER.id);
      expect(result).toMatchObject({
        contactId: 'c-1',
        name: 'Ada Lovelace',
        title: 'Principal Engineer',
        companyName: 'Analytical Engines',
      });
      // Embedding is not exposed over the wire (heavy + not client-useful).
      expect((result as Record<string, unknown>).embedding).toBeUndefined();
    });

    it('returns 404 when missing (or owned by another user)', async () => {
      service.getContact = vi.fn().mockResolvedValue(null);
      await expect(
        controller.getContact('missing', FAKE_USER),
      ).rejects.toBeInstanceOf(HttpException);
      await expect(
        controller.getContact('missing', FAKE_USER),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('GET /contacts', () => {
    it('returns the caller\'s contacts with default limit', async () => {
      const result = await controller.listContacts(FAKE_USER, undefined);
      expect(service.listContacts).toHaveBeenCalledWith(FAKE_USER.id, 20);
      expect(result).toHaveLength(2);
      expect(result[0].contactId).toBe('c-1');
    });

    it('honours the limit query param', async () => {
      await controller.listContacts(FAKE_USER, '50');
      expect(service.listContacts).toHaveBeenCalledWith(FAKE_USER.id, 50);
    });

    it('clamps limit above the max', async () => {
      await controller.listContacts(FAKE_USER, '10000');
      expect(service.listContacts).toHaveBeenCalledWith(FAKE_USER.id, 100);
    });
  });
});
