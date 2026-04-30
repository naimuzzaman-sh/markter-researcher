import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact, EmailStatus } from '@mirrars/shared';
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
  email_status: EmailStatus;
  email_status_at: string | null;
  email_status_reason: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  'id, owner_id, name, linkedin_url, title, company_name, company_domain, email, location, profile_json, research_notes, embedding, email_status, email_status_at, email_status_reason, created_at, updated_at';

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
    emailStatus: row.email_status,
    emailStatusAt: row.email_status_at ? new Date(row.email_status_at) : null,
    emailStatusReason: row.email_status_reason,
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

/**
 * Bulk variant of `upsertContactByLinkedIn`. Single round-trip for the
 * discovery loop. Returns contacts indexed by `linkedinUrl` so callers
 * can rejoin without relying on PostgREST result ordering — which is
 * usually input-preserving but not contractually guaranteed for upserts
 * with conflict resolution.
 *
 * Empty input → empty Map (no wasted call).
 */
export async function bulkUpsertContactsByLinkedIn(
  client: SupabaseClient,
  inputs: UpsertInput[],
): Promise<Map<string, Contact>> {
  if (inputs.length === 0) return new Map();
  const rows = inputs.map((input) => ({
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
  }));
  const { data, error } = await client
    .from('contacts')
    .upsert(rows, { onConflict: 'owner_id,linkedin_url' })
    .select(COLS);

  if (error) throw new AppError('upstream', `Failed to bulk-upsert contacts: ${error.message}`);
  const map = new Map<string, Contact>();
  for (const row of (data ?? []) as ContactRow[]) {
    map.set(row.linkedin_url ?? '', rowToContact(row));
  }
  return map;
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

/**
 * Look up contacts by email address — used by the Resend webhook to
 * route bounce/complaint events to the right row(s). One email can
 * legitimately appear under multiple owners (we discover the same
 * person for different briefs across different researchers), so this
 * returns an array.
 */
export async function findContactsByEmail(
  client: SupabaseClient,
  email: string,
): Promise<Contact[]> {
  const { data, error } = await client
    .from('contacts')
    .select(COLS)
    .eq('email', email);
  if (error) throw new AppError('upstream', `Failed to find contacts by email: ${error.message}`);
  return ((data ?? []) as ContactRow[]).map(rowToContact);
}

/**
 * Mutate the deliverability state. Webhook handler calls this for each
 * matching contact when a bounce/complaint/delivered event arrives.
 * Reason is the human-readable diagnostic from Resend (or null for
 * `'delivered'`).
 */
export async function updateContactEmailStatus(
  client: SupabaseClient,
  id: string,
  status: EmailStatus,
  reason: string | null,
): Promise<void> {
  const { error } = await client
    .from('contacts')
    .update({
      email_status: status,
      email_status_at: new Date().toISOString(),
      email_status_reason: reason,
    })
    .eq('id', id);
  if (error) {
    throw new AppError('upstream', `Failed to update email status: ${error.message}`);
  }
}
