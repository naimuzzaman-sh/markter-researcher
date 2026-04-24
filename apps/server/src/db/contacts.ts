import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact } from '@mirrars/shared';
import { AppError } from '../lib/errors';
import { formatVectorForInsert, parseVectorFromRow } from './pgvector';

type ContactRow = {
  id: string;
  owner_id: string;
  name: string;
  linkedin_url: string | null;
  title: string | null;
  company_name: string | null;
  company_domain: string | null;
  email: string | null;
  location: string | null;
  profile_json: unknown | null;
  research_notes: string | null;
  embedding: string | number[] | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  'id, owner_id, name, linkedin_url, title, company_name, company_domain, email, location, profile_json, research_notes, embedding, created_at, updated_at';

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    linkedinUrl: row.linkedin_url,
    title: row.title,
    companyName: row.company_name,
    companyDomain: row.company_domain,
    email: row.email,
    location: row.location,
    profileJson: row.profile_json,
    researchNotes: row.research_notes,
    embedding: parseVectorFromRow(row.embedding),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

type UpsertInput = {
  ownerId: string;
  linkedinUrl: string;
  name: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  location: string | null;
  profileJson: unknown;
  embedding: number[] | null;
};

export async function upsertContactByLinkedIn(
  client: SupabaseClient,
  input: UpsertInput,
): Promise<Contact> {
  const { data, error } = await client
    .from('contacts')
    .upsert(
      {
        owner_id: input.ownerId,
        linkedin_url: input.linkedinUrl,
        name: input.name,
        title: input.title,
        company_name: input.companyName,
        company_domain: input.companyDomain,
        email: input.email,
        location: input.location,
        profile_json: input.profileJson,
        embedding: formatVectorForInsert(input.embedding),
      },
      { onConflict: 'owner_id,linkedin_url' },
    )
    .select(COLS)
    .single();

  if (error) throw new AppError('upstream', `Failed to upsert contact: ${error.message}`);
  return rowToContact(data as ContactRow);
}

export async function getContactById(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<Contact | null> {
  const { data, error } = await client
    .from('contacts')
    .select(COLS)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch contact: ${error.message}`);
  if (!data) return null;
  return rowToContact(data as ContactRow);
}

export async function listContactsByOwner(
  client: SupabaseClient,
  ownerId: string,
  limit: number,
): Promise<Contact[]> {
  const { data, error } = await client
    .from('contacts')
    .select(COLS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list contacts: ${error.message}`);
  return ((data ?? []) as ContactRow[]).map(rowToContact);
}

export async function updateContactResearchNotes(
  client: SupabaseClient,
  id: string,
  notes: string,
): Promise<void> {
  const { error } = await client
    .from('contacts')
    .update({ research_notes: notes })
    .eq('id', id);
  if (error) throw new AppError('upstream', `Failed to update research notes: ${error.message}`);
}
