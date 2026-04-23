import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Contact } from '@market-researcher/shared';
import { ContactsService } from './contacts.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

type ContactWire = {
  contactId: string;
  name: string;
  linkedinUrl: string | null;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  location: string | null;
  profileJson: unknown | null;
  researchNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

function toWire(contact: Contact): ContactWire {
  // Explicitly omits `ownerId` and `embedding`:
  //   - ownerId is redundant (the authenticated user already knows)
  //   - embedding is heavy (1536 floats) and never useful on the wire
  return {
    contactId: contact.id,
    name: contact.name,
    linkedinUrl: contact.linkedinUrl,
    title: contact.title,
    companyName: contact.companyName,
    companyDomain: contact.companyDomain,
    email: contact.email,
    location: contact.location,
    profileJson: contact.profileJson,
    researchNotes: contact.researchNotes,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function parseLimit(raw: string | undefined): number {
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT;
}

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get(':id')
  @UseGuards(JwtGuard)
  async getContact(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ContactWire> {
    const contact = await this.contactsService.getContact(id, user.id);
    if (!contact) {
      throw new HttpException('Contact not found', HttpStatus.NOT_FOUND);
    }
    return toWire(contact);
  }

  @Get()
  @UseGuards(JwtGuard)
  async listContacts(
    @CurrentUser() user: AuthUser,
    @Query('limit') rawLimit: string | undefined,
  ): Promise<ContactWire[]> {
    const limit = parseLimit(rawLimit);
    const contacts = await this.contactsService.listContacts(user.id, limit);
    return contacts.map(toWire);
  }
}
