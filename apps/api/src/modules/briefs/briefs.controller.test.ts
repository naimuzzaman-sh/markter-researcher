import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { BriefsController } from './briefs.controller';
import type { BriefsService } from './briefs.service';
import type { ResearchContext } from '../../types/research-context.type';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };

const validContext: ResearchContext = {
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

describe('BriefsController', () => {
  let controller: BriefsController;
  let service: BriefsService;

  beforeEach(() => {
    service = {
      createBrief: vi.fn().mockResolvedValue({ id: 'new-brief-id' }),
      getBrief: vi.fn().mockResolvedValue({
        id: 'existing',
        researchContext: validContext,
        createdAt: new Date(),
      }),
    } as unknown as BriefsService;
    controller = new BriefsController(service);
  });

  describe('POST /briefs', () => {
    it('creates and returns briefId, stamping owner_id from the authenticated user', async () => {
      const result = await controller.createBrief(
        { context: validContext },
        FAKE_USER,
      );
      expect(result).toEqual({ briefId: 'new-brief-id' });
      expect(service.createBrief).toHaveBeenCalledWith(
        validContext,
        FAKE_USER.id,
      );
    });

    it('rejects invalid context with 400', async () => {
      await expect(
        controller.createBrief({ context: { bogus: true } }, FAKE_USER),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('GET /briefs/:id', () => {
    it('returns brief shape', async () => {
      const result = await controller.getBrief('existing');
      expect(result.briefId).toBe('existing');
      expect(result.researchContext).toEqual(validContext);
    });

    it('returns 404 when brief not found', async () => {
      service.getBrief = vi.fn().mockResolvedValue(null);
      await expect(controller.getBrief('missing')).rejects.toBeInstanceOf(
        HttpException,
      );
      await expect(controller.getBrief('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
