import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import type { SupabaseService } from '../persistence/supabase.service';

const VERIFICATION_BASE = 'https://app.example.com';

function makeSupabase(): SupabaseService {
  return {
    refreshSession: vi.fn(),
  } as unknown as SupabaseService;
}

describe('AuthService', () => {
  let service: AuthService;
  let supabase: SupabaseService;

  beforeEach(() => {
    // Fake timers let us deterministically exercise TTL + rate-limit
    // behavior without real delays. System time is pinned so generated
    // expiresAt values are stable across test runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    supabase = makeSupabase();
    service = new AuthService(supabase);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('refresh', () => {
    it('delegates to SupabaseService.refreshSession and returns its result', async () => {
      supabase.refreshSession = vi.fn().mockResolvedValue({
        accessToken: 'new-jwt',
        refreshToken: 'new-refresh',
        expiresAt: 1717171717,
        userId: 'u1',
      });
      const result = await service.refresh('old-refresh');
      expect(supabase.refreshSession).toHaveBeenCalledWith('old-refresh');
      expect(result).toEqual({
        accessToken: 'new-jwt',
        refreshToken: 'new-refresh',
        expiresAt: 1717171717,
        userId: 'u1',
      });
    });

    it('returns null when Supabase rejects the refresh token', async () => {
      supabase.refreshSession = vi.fn().mockResolvedValue(null);
      expect(await service.refresh('bad')).toBeNull();
    });
  });

  describe('startDevice', () => {
    it('returns a unique deviceCode + userCode + verificationUri + polling params', () => {
      const a = service.startDevice(VERIFICATION_BASE);
      const b = service.startDevice(VERIFICATION_BASE);

      expect(a.deviceCode).not.toBe(b.deviceCode);
      expect(a.userCode).not.toBe(b.userCode);
      expect(a.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(a.verificationUri).toBe(
        `${VERIFICATION_BASE}/authorize/${a.userCode}`,
      );
      expect(a.pollInterval).toBeGreaterThan(0);
      expect(a.expiresIn).toBe(600);
    });
  });

  describe('pollDevice', () => {
    it('returns "pending" immediately after start', () => {
      const { deviceCode } = service.startDevice(VERIFICATION_BASE);
      vi.advanceTimersByTime(5000); // past pollInterval
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'pending' });
    });

    it('returns "expired" for an unknown deviceCode (no enumeration leak)', () => {
      expect(service.pollDevice('never-issued-code')).toEqual({
        status: 'expired',
      });
    });

    it('returns "authorized" with tokens after authorize, then evicts on the next poll', () => {
      const { deviceCode, userCode } = service.startDevice(VERIFICATION_BASE);
      service.authorizeDevice({
        userCode,
        userId: 'user-1',
        accessToken: 'jwt-abc',
        refreshToken: 'ref-xyz',
        tokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      vi.advanceTimersByTime(5000);
      expect(service.pollDevice(deviceCode)).toEqual({
        status: 'authorized',
        accessToken: 'jwt-abc',
        refreshToken: 'ref-xyz',
        userId: 'user-1',
        expiresAt: expect.any(Number),
      });

      vi.advanceTimersByTime(5000);
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'expired' });
    });

    it('returns "denied" after deny, then evicts', () => {
      const { deviceCode, userCode } = service.startDevice(VERIFICATION_BASE);
      service.denyDevice(userCode);

      vi.advanceTimersByTime(5000);
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'denied' });
      vi.advanceTimersByTime(5000);
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'expired' });
    });

    it('returns "slow_down" when polled faster than the interval', () => {
      const { deviceCode, pollInterval } = service.startDevice(VERIFICATION_BASE);

      vi.advanceTimersByTime(pollInterval * 1000);
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'pending' });

      // Immediate second poll before the next interval → slow_down.
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'slow_down' });
    });

    it('returns "expired" after TTL elapses', () => {
      const { deviceCode } = service.startDevice(VERIFICATION_BASE);
      vi.advanceTimersByTime(601 * 1000);
      expect(service.pollDevice(deviceCode)).toEqual({ status: 'expired' });
    });
  });

  describe('authorizeDevice', () => {
    it('throws when userCode does not match an active pending device', () => {
      expect(() =>
        service.authorizeDevice({
          userCode: 'FAKE-0000',
          userId: 'user-1',
          accessToken: 't',
          refreshToken: 'r',
          tokenExpiresAt: 0,
        }),
      ).toThrow(/invalid or expired/i);
    });

    it('throws when the device has already been authorized', () => {
      const { userCode } = service.startDevice(VERIFICATION_BASE);
      service.authorizeDevice({
        userCode,
        userId: 'user-1',
        accessToken: 't',
        refreshToken: 'r',
        tokenExpiresAt: 0,
      });

      expect(() =>
        service.authorizeDevice({
          userCode,
          userId: 'user-2',
          accessToken: 't2',
          refreshToken: 'r2',
          tokenExpiresAt: 0,
        }),
      ).toThrow(/invalid or expired/i);
    });

    it('throws when the device has expired', () => {
      const { userCode } = service.startDevice(VERIFICATION_BASE);
      vi.advanceTimersByTime(601 * 1000);

      expect(() =>
        service.authorizeDevice({
          userCode,
          userId: 'user-1',
          accessToken: 't',
          refreshToken: 'r',
          tokenExpiresAt: 0,
        }),
      ).toThrow(/invalid or expired/i);
    });
  });

  describe('denyDevice', () => {
    it('throws when userCode is not pending', () => {
      expect(() => service.denyDevice('FAKE-0000')).toThrow(
        /invalid or expired/i,
      );
    });
  });
});
