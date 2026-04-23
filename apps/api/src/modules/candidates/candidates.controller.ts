import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { BriefCandidate } from '@market-researcher/shared';
import { CandidatesService } from './candidates.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

type CandidateWire = {
  candidateId: string;
  briefId: string;
  contactId: string;
  status: BriefCandidate['status'];
  source: BriefCandidate['source'];
  matchScore: number | null;
  interviewId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toWire(c: BriefCandidate): CandidateWire {
  return {
    candidateId: c.id,
    briefId: c.briefId,
    contactId: c.contactId,
    status: c.status,
    source: c.source,
    matchScore: c.matchScore,
    interviewId: c.interviewId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function parseLimit(raw: string | undefined): number {
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT;
}

@Controller()
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get('candidates/:id')
  @UseGuards(JwtGuard)
  async getCandidate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CandidateWire> {
    const cand = await this.candidatesService.getCandidate(id, user.id);
    if (!cand) {
      throw new HttpException('Candidate not found', HttpStatus.NOT_FOUND);
    }
    return toWire(cand);
  }

  @Get('briefs/:briefId/candidates')
  @UseGuards(JwtGuard)
  async listForBrief(
    @Param('briefId') briefId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') rawLimit: string | undefined,
  ): Promise<CandidateWire[]> {
    const limit = parseLimit(rawLimit);
    const list = await this.candidatesService.listForBrief(
      briefId,
      user.id,
      limit,
    );
    return list.map(toWire);
  }

  @Post('candidates/:id/approve')
  @UseGuards(JwtGuard)
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CandidateWire> {
    const updated = await this.candidatesService.approve(id, user.id);
    if (!updated) {
      throw new HttpException('Candidate not found', HttpStatus.NOT_FOUND);
    }
    return toWire(updated);
  }

  @Post('candidates/:id/reject')
  @UseGuards(JwtGuard)
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CandidateWire> {
    const updated = await this.candidatesService.reject(id, user.id);
    if (!updated) {
      throw new HttpException('Candidate not found', HttpStatus.NOT_FOUND);
    }
    return toWire(updated);
  }
}
