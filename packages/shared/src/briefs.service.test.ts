import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BriefsService } from './briefs.service';
import type { SupabaseService } from './supabase.service';
import type { BriefPatch, ResearchContext } from './types/research-context.type';

const sampleContext: ResearchContext = {
  company: { name: 'Co', industry: 'SaaS', description: 'desc' },
  product: {
    name: 'P',
    description: 'd',
    keyFeatures: ['a'],
    targetAudience: 'ta',
  },
  research: {
    objective: 'obj',
    questions: [
      { id: 'q1', text: 'Q?', followUp: 'F?', category: 'background' },
    ],
    concerns: [],
    productMarketFit: { hypothesis: 'h', signals: [] },
  },
  interviewSettings: {
    maxDurationMinutes: 5,
    tone: 'friendly',
    language: 'en',
  },
};

describe('BriefsService', () => {
  let service: BriefsService;
  let persistence: SupabaseService;

  beforeEach(() => {
    persistence = {
      insertBrief: vi.fn().mockResolvedValue('brief-uuid'),
      getBriefById: vi.fn().mockResolvedValue({
        id: 'brief-uuid',
        researchContext: sampleContext,
        createdAt: new Date('2026-04-18T10:00:00Z'),
      }),
      listBriefsByOwner: vi.fn().mockResolvedValue([
        {
          id: 'b1',
          researchContext: sampleContext,
          createdAt: new Date('2026-04-20T12:00:00Z'),
        },
      ]),
    } as unknown as SupabaseService;
    service = new BriefsService(persistence);
  });

  describe('createBrief', () => {
    it('passes owner to persistence and returns the new brief id', async () => {
      const { id } = await service.createBrief(sampleContext, 'owner-1');
      expect(id).toBe('brief-uuid');
      expect(persistence.insertBrief).toHaveBeenCalledWith(
        sampleContext,
        'owner-1',
      );
    });
  });

  describe('getBrief', () => {
    it('returns the brief when present', async () => {
      const brief = await service.getBrief('brief-uuid');
      expect(brief?.id).toBe('brief-uuid');
      expect(brief?.researchContext).toEqual(sampleContext);
    });

    it('returns null when not found', async () => {
      persistence.getBriefById = vi.fn().mockResolvedValue(null);
      const brief = await service.getBrief('missing');
      expect(brief).toBeNull();
    });
  });

  describe('listBriefs', () => {
    it('delegates to persistence.listBriefsByOwner with the owner + limit', async () => {
      const briefs = await service.listBriefs('owner-1', 25);
      expect(persistence.listBriefsByOwner).toHaveBeenCalledWith(
        'owner-1',
        25,
      );
      expect(briefs).toHaveLength(1);
      expect(briefs[0].id).toBe('b1');
    });
  });

  describe('updateBrief', () => {
    const existing = {
      id: 'brief-1',
      researchContext: sampleContext,
      createdAt: new Date('2026-04-18T10:00:00Z'),
    };

    beforeEach(() => {
      persistence.getBriefById = vi.fn().mockResolvedValue(existing);
      persistence.updateBriefById = vi
        .fn()
        .mockImplementation(
          async (id: string, _ownerId: string, ctx: ResearchContext) => ({
            id,
            researchContext: ctx,
            createdAt: existing.createdAt,
          }),
        );
    });

    it('applies a nested field patch (research.objective) and persists the merged context', async () => {
      const patch: BriefPatch = { research: { objective: 'new objective' } };
      const result = await service.updateBrief('brief-1', 'owner-1', patch);
      expect(result?.researchContext.research.objective).toBe('new objective');
      // Sibling subtrees untouched.
      expect(result?.researchContext.product).toEqual(sampleContext.product);
      expect(result?.researchContext.company).toEqual(sampleContext.company);
      expect(persistence.updateBriefById).toHaveBeenCalledWith(
        'brief-1',
        'owner-1',
        expect.objectContaining({
          research: expect.objectContaining({ objective: 'new objective' }),
        }),
      );
    });

    it('merges product.name without losing other product fields (keyFeatures, description, targetAudience)', async () => {
      const patch: BriefPatch = { product: { name: 'New Name' } };
      const result = await service.updateBrief('brief-1', 'owner-1', patch);
      expect(result?.researchContext.product.name).toBe('New Name');
      expect(result?.researchContext.product.description).toBe(
        sampleContext.product.description,
      );
      expect(result?.researchContext.product.keyFeatures).toEqual(
        sampleContext.product.keyFeatures,
      );
      expect(result?.researchContext.product.targetAudience).toBe(
        sampleContext.product.targetAudience,
      );
    });

    it('replaces the questions array wholesale (arrays are not item-merged)', async () => {
      const patch: BriefPatch = {
        research: {
          questions: [
            {
              id: 'qz',
              text: 'Z?',
              followUp: 'ZF?',
              category: 'usage',
            },
          ],
        },
      };
      const result = await service.updateBrief('brief-1', 'owner-1', patch);
      expect(result?.researchContext.research.questions).toHaveLength(1);
      expect(result?.researchContext.research.questions[0].id).toBe('qz');
      // Sibling research fields preserved.
      expect(result?.researchContext.research.objective).toBe(
        sampleContext.research.objective,
      );
    });

    it('merges productMarketFit sub-fields without clobbering siblings', async () => {
      const patch: BriefPatch = {
        research: {
          productMarketFit: { hypothesis: 'revised hypothesis' },
        },
      };
      const result = await service.updateBrief('brief-1', 'owner-1', patch);
      expect(result?.researchContext.research.productMarketFit.hypothesis).toBe(
        'revised hypothesis',
      );
      expect(result?.researchContext.research.productMarketFit.signals).toEqual(
        sampleContext.research.productMarketFit.signals,
      );
    });

    it('returns null when the brief does not exist (and does not attempt the update)', async () => {
      persistence.getBriefById = vi.fn().mockResolvedValue(null);
      const result = await service.updateBrief('missing', 'owner-1', {
        research: { objective: 'x' },
      });
      expect(result).toBeNull();
      expect(persistence.updateBriefById).not.toHaveBeenCalled();
    });

    it('returns null when persistence.updateBriefById reports no matching row (non-owner case)', async () => {
      persistence.updateBriefById = vi.fn().mockResolvedValue(null);
      const result = await service.updateBrief('brief-1', 'not-the-owner', {
        research: { objective: 'x' },
      });
      expect(result).toBeNull();
    });

    it('throws ZodError when the merged context fails schema validation', async () => {
      // An empty objective is valid at the patch layer? No — briefPatchSchema
      // enforces minLength:1 on objective if present. Here we simulate a patch
      // that somehow slips past (e.g. type-unsafe caller) by sending a blank
      // after merge — the service's final validation catches it.
      const patch = { research: { objective: '   ' } } as BriefPatch;
      // Blank-with-whitespace passes min(1); zod doesn't auto-trim. So use a
      // different trigger: zero-length keyFeatures on product (only possible if
      // patch explicitly sends []), which fails the researchContextSchema
      // merged-result check.
      const badPatch = { product: { keyFeatures: [] } } as unknown as BriefPatch;
      void patch;
      await expect(
        service.updateBrief('brief-1', 'owner-1', badPatch),
      ).rejects.toThrow();
      expect(persistence.updateBriefById).not.toHaveBeenCalled();
    });

    it('passes the complete merged context (not just the patch) to persistence', async () => {
      const patch: BriefPatch = {
        interviewSettings: { maxDurationMinutes: 15 },
      };
      await service.updateBrief('brief-1', 'owner-1', patch);
      const [, , persistedCtx] = (
        persistence.updateBriefById as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(persistedCtx.interviewSettings.maxDurationMinutes).toBe(15);
      // Everything else should survive the merge intact.
      expect(persistedCtx.interviewSettings.tone).toBe(
        sampleContext.interviewSettings.tone,
      );
      expect(persistedCtx.company).toEqual(sampleContext.company);
    });
  });
});
