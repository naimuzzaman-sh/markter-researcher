import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { researchContextSchema } from '../../types/research-context.type';

type CreateBriefBody = {
  context: unknown;
};

@Controller('briefs')
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

  @Post()
  async createBrief(@Body() body: CreateBriefBody) {
    const parsed = researchContextSchema.safeParse(body.context);
    if (!parsed.success) {
      throw new HttpException(
        { message: 'Invalid research context', issues: parsed.error.issues },
        HttpStatus.BAD_REQUEST,
      );
    }
    const { id } = await this.briefsService.createBrief(parsed.data);
    return { briefId: id };
  }

  @Get(':id')
  async getBrief(@Param('id') id: string) {
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
