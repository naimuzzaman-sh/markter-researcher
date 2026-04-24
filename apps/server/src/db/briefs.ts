import type { SupabaseClient } from '@supabase/supabase-js';
import { researchContextSchema, type ResearchContext, type Brief } from '@market-researcher/shared';
import { AppError } from '../lib/errors';

type BriefRow = {
  id: string;
  research_context: unknown;
  created_at: string;
};

function rowToBrief(row: BriefRow): Brief {
  return {
    id: row.id,
    researchContext: researchContextSchema.parse(row.research_context),
    createdAt: new Date(row.created_at),
  };
}

export async function listBriefsByOwner(
  client: SupabaseClient,
  ownerId: string,
  limit: number,
): Promise<Brief[]> {
  const { data, error } = await client
    .from('briefs')
    .select('id, research_context, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list briefs: ${error.message}`);
  return (data ?? []).map((r) => rowToBrief(r as BriefRow));
}

export async function getBriefById(
  client: SupabaseClient,
  id: string,
): Promise<Brief | null> {
  const { data, error } = await client
    .from('briefs')
    .select('id, research_context, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch brief: ${error.message}`);
  if (!data) return null;
  return rowToBrief(data as BriefRow);
}

export async function insertBrief(
  client: SupabaseClient,
  context: ResearchContext,
  ownerId: string,
): Promise<string> {
  const { data, error } = await client
    .from('briefs')
    .insert({ research_context: context, owner_id: ownerId })
    .select('id')
    .single();

  if (error) throw new AppError('upstream', `Failed to insert brief: ${error.message}`);
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new AppError('internal', 'Brief insert returned no id');
  }
  return (data as { id: string }).id;
}

/**
 * Replace `research_context` for a brief the owner owns. Returns the merged
 * brief, or null when the row doesn't exist OR belongs to a different owner
 * (we collapse both to null so we don't leak existence).
 */
export async function updateBriefById(
  client: SupabaseClient,
  briefId: string,
  ownerId: string,
  newContext: ResearchContext,
): Promise<Brief | null> {
  const { data, error } = await client
    .from('briefs')
    .update({ research_context: newContext })
    .eq('id', briefId)
    .eq('owner_id', ownerId)
    .select('id, research_context, created_at')
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to update brief: ${error.message}`);
  if (!data) return null;
  return rowToBrief(data as BriefRow);
}
