import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { BriefsController } from './briefs.controller';
import type { BriefsService } from './briefs.service';
import type { ResearchContext } from '@market-researcher/shared';
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
      listBriefs: vi.fn().mockResolvedValue([
        {
          id: 'b1',
          researchContext: validContext,
          createdAt: new Date('2026-04-20T12:00:00Z'),
        },
        {
          id: 'b2',
          researchContext: validContext,
          createdAt: new Date('2026-04-19T12:00:00Z'),
        },
      ]),
      updateBrief: vi.fn().mockResolvedValue({
        id: 'existing',
        researchContext: validContext,
        createdAt: new Date('2026-04-20T12:00:00Z'),
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

  describe('GET /briefs', () => {
    it('returns the authenticated user\'s briefs mapped to the wire shape', async () => {
      const result = await controller.listBriefs(FAKE_USER, undefined);
      expect(service.listBriefs).toHaveBeenCalledWith(FAKE_USER.id, 20);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        briefId: 'b1',
        researchContext: validContext,
      });
      expect(typeof result[0].createdAt).toBe('string');
    });

    it('honours the limit query param when provided', async () => {
      await controller.listBriefs(FAKE_USER, '50');
      expect(service.listBriefs).toHaveBeenCalledWith(FAKE_USER.id, 50);
    });

    it('clamps limit to sane bounds (rejects non-numeric)', async () => {
      await controller.listBriefs(FAKE_USER, 'abc');
      // Falls back to default when input is non-numeric
      expect(service.listBriefs).toHaveBeenCalledWith(FAKE_USER.id, 20);
    });
  });

  describe('PATCH /briefs/:id', () => {
    it('applies the patch scoped to the authenticated user and returns the updated brief', async () => {
      const patchedContext = {
        ...validContext,
        research: { ...validContext.research, objective: 'new objective' },
      };
      service.updateBrief = vi.fn().mockResolvedValue({
        id: 'existing',
        researchContext: patchedContext,
        createdAt: new Date('2026-04-20T12:00:00Z'),
      });

      const result = await controller.updateBrief(
        'existing',
        { patch: { research: { objective: 'new objective' } } },
        FAKE_USER,
      );

      expect(result).toMatchObject({
        briefId: 'existing',
        researchContext: patchedContext,
      });
      expect(typeof result.createdAt).toBe('string');
      expect(service.updateBrief).toHaveBeenCalledWith(
        'existing',
        FAKE_USER.id,
        { research: { objective: 'new objective' } },
      );
    });

    it('rejects a malformed patch with 400 (and does not hit the service)', async () => {
      await expect(
        controller.updateBrief(
          'existing',
          { patch: { research: { objective: '' } } },
          FAKE_USER,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(service.updateBrief).not.toHaveBeenCalled();
    });

    it('returns 404 when the brief does not exist or is not owned by the caller', async () => {
      service.updateBrief = vi.fn().mockResolvedValue(null);
      await expect(
        controller.updateBrief(
          'missing',
          { patch: { research: { objective: 'new' } } },
          FAKE_USER,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('translates a ZodError from the service (invalid merged context) into a 400', async () => {
      // Service throws when the patch shape slips past controller validation
      // but the merged context is rejected by researchContextSchema.
      service.updateBrief = vi.fn().mockImplementation(() => {
        const err = new Error('merged context invalid') as Error & {
          name: string;
          issues: unknown[];
        };
        err.name = 'ZodError';
        err.issues = [{ path: ['research'], message: 'x' }];
        throw err;
      });
      await expect(
        controller.updateBrief(
          'existing',
          { patch: {} },
          FAKE_USER,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });
});
