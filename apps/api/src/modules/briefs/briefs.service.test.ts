import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BriefsService } from './briefs.service';
import type { SupabaseService } from '../persistence/supabase.service';
import type { ResearchContext } from '../../types/research-context.type';

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
    } as unknown as SupabaseService;
    service = new BriefsService(persistence);
  });

  describe('createBrief', () => {
    it('returns the new brief id', async () => {
      const { id } = await service.createBrief(sampleContext);
      expect(id).toBe('brief-uuid');
      expect(persistence.insertBrief).toHaveBeenCalledWith(sampleContext);
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
});
