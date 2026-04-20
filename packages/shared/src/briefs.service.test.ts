import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BriefsService } from './briefs.service';
import type { SupabaseService } from './supabase.service';
import type { ResearchContext } from './types/research-context.type';

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
});
