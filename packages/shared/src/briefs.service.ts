import type { SupabaseService } from './supabase.service';
import type { Brief } from './types/brief.type';
import {
  researchContextSchema,
  type BriefPatch,
  type ResearchContext,
} from './types/research-context.type';

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

  /**
   * Apply a partial patch on top of an existing brief's researchContext.
   * Merge semantics (intentionally shallow, documented on `briefPatchSchema`):
   *  - Top-level subtrees (company/product/research/interviewSettings) merge
   *    one level deep.
   *  - Arrays (questions, concerns, signals, keyFeatures) replace wholesale.
   *  - `research.productMarketFit` merges its own fields.
   *
   * Returns null when the brief doesn't exist OR the UPDATE finds no row for
   * this owner (the two failure modes collapse on purpose — we don't leak
   * whether a given briefId exists under a different owner).
   *
   * Throws ZodError if the merged context fails `researchContextSchema` — this
   * indicates a malformed patch that would produce an invalid brief on disk.
   */
  async updateBrief(
    briefId: string,
    ownerId: string,
    patch: BriefPatch,
  ): Promise<Brief | null> {
    const existing = await this.persistence.getBriefById(briefId);
    if (!existing) return null;

    const merged = mergeContext(existing.researchContext, patch);
    // Final defence: the patch shape alone can't guarantee the merged result
    // is valid, so re-validate the complete context before persisting.
    const validated = researchContextSchema.parse(merged);

    return this.persistence.updateBriefById(briefId, ownerId, validated);
  }
}

function mergeContext(
  existing: ResearchContext,
  patch: BriefPatch,
): ResearchContext {
  return {
    company: patch.company
      ? { ...existing.company, ...patch.company }
      : existing.company,
    product: patch.product
      ? { ...existing.product, ...patch.product }
      : existing.product,
    research: patch.research
      ? {
          ...existing.research,
          ...patch.research,
          productMarketFit: patch.research.productMarketFit
            ? {
                ...existing.research.productMarketFit,
                ...patch.research.productMarketFit,
              }
            : existing.research.productMarketFit,
        }
      : existing.research,
    interviewSettings: patch.interviewSettings
      ? { ...existing.interviewSettings, ...patch.interviewSettings }
      : existing.interviewSettings,
  };
}
