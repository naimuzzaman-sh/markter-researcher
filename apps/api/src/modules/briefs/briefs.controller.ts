import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { researchContextSchema } from '@market-researcher/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

type CreateBriefBody = {
  context: unknown;
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

@Controller('briefs')
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

  @Post()
  @UseGuards(JwtGuard)
  async createBrief(
    @Body() body: CreateBriefBody,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = researchContextSchema.safeParse(body.context);
    if (!parsed.success) {
      throw new HttpException(
        { message: 'Invalid research context', issues: parsed.error.issues },
        HttpStatus.BAD_REQUEST,
      );
    }
    const { id } = await this.briefsService.createBrief(parsed.data, user.id);
    return { briefId: id };
  }

  @Get()
  @UseGuards(JwtGuard)
  async listBriefs(
    @CurrentUser() user: AuthUser,
    @Query('limit') rawLimit: string | undefined,
  ) {
    const parsed = rawLimit !== undefined ? Number(rawLimit) : NaN;
    const limit =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.floor(parsed), MAX_LIST_LIMIT)
        : DEFAULT_LIST_LIMIT;
    const briefs = await this.briefsService.listBriefs(user.id, limit);
    return briefs.map((b) => ({
      briefId: b.id,
      researchContext: b.researchContext,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  @Get(':id')
  async getBrief(@Param('id') id: string) {
    // Public: interviewees need to read the brief to take the interview.
    const brief = await this.briefsService.getBrief(id);
    if (!brief) {
      throw new HttpException('Brief not found', HttpStatus.NOT_FOUND);
    }
    return {
      briefId: brief.id,
      researchContext: brief.researchContext,
      createdAt: brief.createdAt.toISOString(),
    };
  }
}
