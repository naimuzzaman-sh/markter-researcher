import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../persistence/supabase.service';
import type { Brief } from '../../types/brief.type';
import type { ResearchContext } from '../../types/research-context.type';

@Injectable()
export class BriefsService {
  constructor(private readonly persistence: SupabaseService) {}

  async createBrief(context: ResearchContext): Promise<{ id: string }> {
    const id = await this.persistence.insertBrief(context);
    return { id };
  }

  async getBrief(id: string): Promise<Brief | null> {
    return this.persistence.getBriefById(id);
  }
}
