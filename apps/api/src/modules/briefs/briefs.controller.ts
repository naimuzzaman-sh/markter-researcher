import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BriefsService } from './briefs.service';
import {
  briefPatchSchema,
  researchContextSchema,
} from '@market-researcher/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

type CreateBriefBody = {
  context: unknown;
};

type UpdateBriefBody = {
  patch: unknown;
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

  @Patch(':id')
  @UseGuards(JwtGuard)
  async updateBrief(
    @Param('id') id: string,
    @Body() body: UpdateBriefBody,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = briefPatchSchema.safeParse(body.patch);
    if (!parsed.success) {
      throw new HttpException(
        { message: 'Invalid brief patch', issues: parsed.error.issues },
        HttpStatus.BAD_REQUEST,
      );
    }

    // The service re-validates the *merged* context against the full schema
    // and throws ZodError if it slips past — translate to 400 so the caller
    // sees a validation failure rather than a 500.
    let updated;
    try {
      updated = await this.briefsService.updateBrief(
        id,
        user.id,
        parsed.data,
      );
    } catch (err) {
      if (isZodError(err)) {
        throw new HttpException(
          { message: 'Invalid merged brief', issues: err.issues },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw err;
    }

    if (!updated) {
      throw new HttpException('Brief not found', HttpStatus.NOT_FOUND);
    }
    return {
      briefId: updated.id,
      researchContext: updated.researchContext,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}

function isZodError(err: unknown): err is { name: string; issues: unknown[] } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'ZodError' &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}
