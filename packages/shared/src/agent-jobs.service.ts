import type { SupabaseService } from './supabase.service';
import type { AgentJob, AgentJobKind } from './types/agent-job.type';

type EnqueueInput = {
  ownerId: string;
  kind: AgentJobKind;
  input: unknown;
};

type CompleteInput = {
  output: unknown;
  costUsd?: number | null;
  tokensUsed?: number | null;
};

/**
 * Thin orchestration over SupabaseService for the generic `agent_jobs` queue.
 *
 * Usage split mirrors `BriefsService`:
 *  - Callers (NestJS wrapper + future MCP direct use) hit the methods here.
 *  - All SQL lives on `SupabaseService` for consistency and easy testing.
 *
 * Owner scoping is enforced here: `getJob` returns `null` when a job exists
 * but belongs to a different owner, matching the application-level scoping
 * used across the rest of the codebase (we can migrate to RLS later without
 * callers noticing).
 */
export class AgentJobsService {
  constructor(private readonly persistence: SupabaseService) {}

  async enqueue({
    ownerId,
    kind,
    input,
  }: EnqueueInput): Promise<{ id: string }> {
    const id = await this.persistence.insertAgentJob({
      ownerId,
      kind,
      inputJson: input,
    });
    return { id };
  }

  async getJob(id: string, ownerId: string): Promise<AgentJob | null> {
    const job = await this.persistence.getAgentJobById(id);
    if (!job) return null;
    // Application-level owner scoping. If a caller ever reuses this method
    // for worker-internal access (no owner check), add a separate entry point.
    if (job.ownerId !== ownerId) return null;
    return job;
  }

  async listJobs(ownerId: string, limit: number): Promise<AgentJob[]> {
    return this.persistence.listAgentJobsByOwner(ownerId, limit);
  }

  /**
   * Called by the background worker. Atomically flips the oldest queued job
   * to `running` and returns it. Null means nothing to do.
   */
  async claimNext(): Promise<AgentJob | null> {
    return this.persistence.claimNextQueuedJob();
  }

  async complete(id: string, result: CompleteInput): Promise<void> {
    await this.persistence.completeAgentJob(id, {
      outputJson: result.output,
      costUsd: result.costUsd ?? null,
      tokensUsed: result.tokensUsed ?? null,
    });
  }

  async fail(id: string, error: string): Promise<void> {
    await this.persistence.failAgentJob(id, error);
  }
}
