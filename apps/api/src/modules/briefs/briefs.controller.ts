import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { researchContextSchema } from '../../types/research-context.type';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

type CreateBriefBody = {
  context: unknown;
};

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
