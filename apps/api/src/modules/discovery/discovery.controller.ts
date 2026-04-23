import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { DiscoveryService } from './discovery.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

const runDiscoveryBodySchema = z.object({
  briefId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).optional().default(10),
  extraCriteria: z.string().max(500).optional(),
});

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Post('runs')
  @UseGuards(JwtGuard)
  async runDiscovery(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<{ jobId: string }> {
    const parsed = runDiscoveryBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { message: 'Invalid discovery request', issues: parsed.error.issues },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.discoveryService.enqueue(parsed.data, user.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Brief not found/i.test(message)) {
        throw new HttpException('Brief not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Failed to start discovery',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
