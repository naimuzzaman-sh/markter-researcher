import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import type { DiscoveryService } from './discovery.service';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };
const BRIEF_ID = '22222222-2222-2222-2222-222222222222';

describe('DiscoveryController', () => {
  let controller: DiscoveryController;
  let service: DiscoveryService;

  beforeEach(() => {
    service = {
      enqueue: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    } as unknown as DiscoveryService;
    controller = new DiscoveryController(service);
  });

  it('enqueues a discovery run and returns the jobId', async () => {
    const result = await controller.runDiscovery(
      { briefId: BRIEF_ID, limit: 10 },
      FAKE_USER,
    );
    expect(result).toEqual({ jobId: 'job-1' });
    expect(service.enqueue).toHaveBeenCalledWith(
      { briefId: BRIEF_ID, limit: 10 },
      FAKE_USER.id,
    );
  });

  it('defaults limit to 10 when not provided', async () => {
    await controller.runDiscovery({ briefId: BRIEF_ID }, FAKE_USER);
    expect(service.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
      FAKE_USER.id,
    );
  });

  it('rejects invalid briefId with 400', async () => {
    await expect(
      controller.runDiscovery({ briefId: 'not-a-uuid' }, FAKE_USER),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('rejects limit above 50 with 400', async () => {
    await expect(
      controller.runDiscovery({ briefId: BRIEF_ID, limit: 999 }, FAKE_USER),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('maps "Brief not found" from the service to 404', async () => {
    service.enqueue = vi.fn().mockRejectedValue(new Error('Brief not found'));
    await expect(
      controller.runDiscovery({ briefId: BRIEF_ID }, FAKE_USER),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('maps other service errors to 500', async () => {
    service.enqueue = vi.fn().mockRejectedValue(new Error('supabase down'));
    await expect(
      controller.runDiscovery({ briefId: BRIEF_ID }, FAKE_USER),
    ).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });
});
