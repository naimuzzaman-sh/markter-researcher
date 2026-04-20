import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIST_LIMIT);
}

@Controller('interviews')
@UseGuards(JwtGuard)
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('briefId') briefId: string | undefined,
    @Query('limit') rawLimit: string | undefined,
  ) {
    const limit = parseLimit(rawLimit, DEFAULT_LIST_LIMIT);
    const rows = await this.interviewsService.list(user.id, briefId, limit);
    return rows.map((r) => ({
      interviewId: r.interviewId,
      briefId: r.briefId,
      status: r.status,
      durationSecs: r.durationSecs,
      overallSentiment: r.overallSentiment,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    }));
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const detail = await this.interviewsService.get(id, user.id);
    if (!detail) {
      // Return 404 for both missing and not-owned — don't leak existence of
      // interviews belonging to other users.
      throw new HttpException('Interview not found', HttpStatus.NOT_FOUND);
    }
    return {
      interviewId: detail.interviewId,
      briefId: detail.briefId,
      status: detail.status,
      transcript: detail.transcript,
      analysis: detail.analysis,
      durationSecs: detail.durationSecs,
      completedAt: detail.completedAt
        ? detail.completedAt.toISOString()
        : null,
    };
  }
}
