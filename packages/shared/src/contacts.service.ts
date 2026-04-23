import type { SupabaseService } from './supabase.service';
import type { Contact } from './types/contact.type';

type CreateContactInput = {
  ownerId: string;
  name: string;
  linkedinUrl: string | null;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  location: string | null;
  profileJson: unknown;
  researchNotes: string | null;
  embedding: number[] | null;
};

type UpsertByLinkedInInput = Omit<CreateContactInput, 'linkedinUrl' | 'researchNotes'> & {
  linkedinUrl: string;
};

/**
 * Thin orchestration over SupabaseService for the `contacts` table.
 *
 * Mirrors `BriefsService` — all SQL lives on SupabaseService; this class only
 * adds application-level rules (owner scoping on reads) and convenience.
 */
export class ContactsService {
  constructor(private readonly persistence: SupabaseService) {}

  async createContact(input: CreateContactInput): Promise<{ id: string }> {
    const id = await this.persistence.insertContact(input);
    return { id };
  }

  /**
   * Used by the discovery flow: if a contact with this LinkedIn URL already
   * exists for the owner, update the profile/embedding fields and return the
   * merged row. Otherwise insert a new row. Either way, return the contact.
   */
  async upsertByLinkedIn(input: UpsertByLinkedInInput): Promise<Contact> {
    return this.persistence.upsertContactByLinkedIn(input);
  }

  async getContact(id: string, ownerId: string): Promise<Contact | null> {
    const contact = await this.persistence.getContactById(id);
    if (!contact) return null;
    if (contact.ownerId !== ownerId) return null;
    return contact;
  }

  async listContacts(ownerId: string, limit: number): Promise<Contact[]> {
    return this.persistence.listContactsByOwner(ownerId, limit);
  }

  async appendResearchNotes(id: string, notes: string): Promise<void> {
    await this.persistence.updateContactResearchNotes(id, notes);
  }
}
