import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentJob, AgentJobKind, AgentJobStatus } from '@market-researcher/shared';
import { AppError } from '../lib/errors';

type Row = {
  id: string;
  owner_id: string;
  kind: string;
  status: string;
  input_json: unknown;
  output_json: unknown | null;
  error: string | null;
  cost_usd: number | string | null;
  tokens_used: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

const COLS =
  'id, owner_id, kind, status, input_json, output_json, error, cost_usd, tokens_used, started_at, finished_at, created_at';

function rowToJob(row: Row): AgentJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind as AgentJobKind,
    status: row.status as AgentJobStatus,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    tokensUsed: row.tokens_used,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export async function insertAgentJob(
  client: SupabaseClient,
  input: { ownerId: string; kind: AgentJobKind; inputJson: unknown },
): Promise<string> {
  const { data, error } = await client
    .from('agent_jobs')
    .insert({
      owner_id: input.ownerId,
      kind: input.kind,
      status: 'queued',
      input_json: input.inputJson,
    })
    .select('id')
    .single();

  if (error) throw new AppError('upstream', `Failed to enqueue agent job: ${error.message}`);
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new AppError('internal', 'Agent job insert returned no id');
  }
  return (data as { id: string }).id;
}

export async function getAgentJobById(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<AgentJob | null> {
  const { data, error } = await client
    .from('agent_jobs')
    .select(COLS)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw new AppError('upstream', `Failed to fetch agent job: ${error.message}`);
  if (!data) return null;
  return rowToJob(data as Row);
}

export async function listAgentJobsByOwner(
  client: SupabaseClient,
  ownerId: string,
  limit: number,
): Promise<AgentJob[]> {
  const { data, error } = await client
    .from('agent_jobs')
    .select(COLS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list agent jobs: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToJob);
}

/**
 * Atomically claim the oldest queued job. Two-step with an optimistic
 * `status = 'queued'` guard on the UPDATE, so a concurrent worker racing on
 * the same row is denied (affects 0 rows).
 */
export async function claimNextQueuedJob(client: SupabaseClient): Promise<AgentJob | null> {
  const { data: candidate, error: selErr } = await client
    .from('agent_jobs')
    .select('id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) throw new AppError('upstream', `Failed to poll agent jobs: ${selErr.message}`);
  if (!candidate) return null;

  const { data: updated, error: updErr } = await client
    .from('agent_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', (candidate as { id: string }).id)
    .eq('status', 'queued')
    .select(COLS)
    .maybeSingle();

  if (updErr) throw new AppError('upstream', `Failed to claim agent job: ${updErr.message}`);
  if (!updated) return null;
  return rowToJob(updated as Row);
}

export async function completeAgentJob(
  client: SupabaseClient,
  id: string,
  result: { outputJson: unknown; costUsd: number | null; tokensUsed: number | null },
): Promise<void> {
  const { error } = await client
    .from('agent_jobs')
    .update({
      status: 'succeeded',
      output_json: result.outputJson,
      cost_usd: result.costUsd,
      tokens_used: result.tokensUsed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new AppError('upstream', `Failed to complete agent job: ${error.message}`);
}

export async function failAgentJob(
  client: SupabaseClient,
  id: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await client
    .from('agent_jobs')
    .update({
      status: 'failed',
      error: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new AppError('upstream', `Failed to mark agent job failed: ${error.message}`);
}
