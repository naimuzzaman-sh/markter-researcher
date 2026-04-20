import type { SupabaseService } from './supabase.service';
import type { Brief } from './types/brief.type';
import type { ResearchContext } from './types/research-context.type';

/**
 * Thin orchestration over SupabaseService. Same class runs inside the NestJS
 * backend (wrapped by a `@Injectable()` subclass) and the MCP server (direct
 * instantiation with a user-JWT-bearing Supabase client).
 */
export class BriefsService {
  constructor(private readonly persistence: SupabaseService) {}

  async createBrief(
    context: ResearchContext,
    ownerId: string,
  ): Promise<{ id: string }> {
    const id = await this.persistence.insertBrief(context, ownerId);
    return { id };
  }

  async getBrief(id: string): Promise<Brief | null> {
    return this.persistence.getBriefById(id);
  }

  async listBriefs(ownerId: string, limit: number): Promise<Brief[]> {
    return this.persistence.listBriefsByOwner(ownerId, limit);
  }
}
