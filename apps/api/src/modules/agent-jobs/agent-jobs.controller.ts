import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AgentJob } from '@market-researcher/shared';
import { AgentJobsService } from './agent-jobs.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

type JobWire = {
  jobId: string;
  kind: AgentJob['kind'];
  status: AgentJob['status'];
  input: unknown;
  output: unknown | null;
  error: string | null;
  costUsd: number | null;
  tokensUsed: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

function toWire(job: AgentJob): JobWire {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    input: job.inputJson,
    output: job.outputJson,
    error: job.error,
    costUsd: job.costUsd,
    tokensUsed: job.tokensUsed,
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
  };
}

function parseLimit(raw: string | undefined): number {
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT;
}

@Controller('agent-jobs')
export class AgentJobsController {
  constructor(private readonly agentJobsService: AgentJobsService) {}

  @Get(':id')
  @UseGuards(JwtGuard)
  async getJob(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<JobWire> {
    const job = await this.agentJobsService.getJob(id, user.id);
    if (!job) {
      // Collapse not-found and not-owned into the same 404 — never leak
      // existence of jobs belonging to other users.
      throw new HttpException('Agent job not found', HttpStatus.NOT_FOUND);
    }
    return toWire(job);
  }

  @Get()
  @UseGuards(JwtGuard)
  async listJobs(
    @CurrentUser() user: AuthUser,
    @Query('limit') rawLimit: string | undefined,
  ): Promise<JobWire[]> {
    const limit = parseLimit(rawLimit);
    const jobs = await this.agentJobsService.listJobs(user.id, limit);
    return jobs.map(toWire);
  }
}
