import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthUser } from '../persistence/supabase.service';

const FAKE_USER: AuthUser = { id: 'user-1', email: 'a@b.com', phone: null };

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    APP_BASE_URL: 'https://app.example.com',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('AuthController', () => {
  let controller: AuthController;
  let auth: AuthService;

  beforeEach(() => {
    auth = {
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'new-jwt',
        refreshToken: 'new-refresh',
        expiresAt: 1717171717,
        userId: 'u1',
      }),
      startDevice: vi.fn().mockReturnValue({
        deviceCode: 'dev-abc',
        userCode: 'WXYZ-1234',
        verificationUri: 'https://app.example.com/authorize/WXYZ-1234',
        pollInterval: 2,
        expiresIn: 600,
      }),
      pollDevice: vi.fn().mockReturnValue({ status: 'pending' }),
      authorizeDevice: vi.fn(),
      denyDevice: vi.fn(),
    } as unknown as AuthService;
    controller = new AuthController(auth, makeConfig());
  });

  describe('POST /auth/refresh', () => {
    it('returns the new token pair on success', async () => {
      const result = await controller.refresh({ refreshToken: 'old-refresh' });
      expect(auth.refresh).toHaveBeenCalledWith('old-refresh');
      expect(result).toEqual({
        accessToken: 'new-jwt',
        refreshToken: 'new-refresh',
        expiresAt: 1717171717,
        userId: 'u1',
      });
    });

    it('returns 400 when body is missing refreshToken', async () => {
      await expect(controller.refresh({ refreshToken: '' })).rejects.toMatchObject(
        { status: HttpStatus.BAD_REQUEST },
      );
    });

    it('returns 401 when the service returns null', async () => {
      auth.refresh = vi.fn().mockResolvedValue(null);
      await expect(
        controller.refresh({ refreshToken: 'bad' }),
      ).rejects.toBeInstanceOf(HttpException);
      await expect(
        controller.refresh({ refreshToken: 'bad' }),
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    });
  });

  describe('POST /auth/device/start', () => {
    it('returns the service\'s start payload', async () => {
      const result = await controller.deviceStart();
      expect(auth.startDevice).toHaveBeenCalledWith('https://app.example.com');
      expect(result).toEqual({
        deviceCode: 'dev-abc',
        userCode: 'WXYZ-1234',
        verificationUri: 'https://app.example.com/authorize/WXYZ-1234',
        pollInterval: 2,
        expiresIn: 600,
      });
    });

    it('returns 500 when APP_BASE_URL is not configured', async () => {
      controller = new AuthController(
        auth,
        makeConfig({ APP_BASE_URL: undefined }),
      );
      await expect(controller.deviceStart()).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it('returns 500 when the service throws (collision bailout)', async () => {
      auth.startDevice = vi.fn().mockImplementation(() => {
        throw new Error('Failed to allocate unique userCode');
      });
      await expect(controller.deviceStart()).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe('GET /auth/device/poll', () => {
    it('forwards the deviceCode to the service and returns the result verbatim', async () => {
      const result = await controller.devicePoll('dev-abc');
      expect(auth.pollDevice).toHaveBeenCalledWith('dev-abc');
      expect(result).toEqual({ status: 'pending' });
    });

    it('returns 400 when deviceCode is missing', async () => {
      await expect(controller.devicePoll(undefined)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('returns 429 on slow_down', async () => {
      auth.pollDevice = vi.fn().mockReturnValue({ status: 'slow_down' });
      await expect(controller.devicePoll('dev-abc')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });

  describe('POST /auth/device/authorize', () => {
    it('passes userCode, user.id, accessToken (from header), refreshToken + tokenExpiresAt to the service', async () => {
      const result = await controller.deviceAuthorize(
        FAKE_USER,
        'Bearer web-jwt-token',
        { userCode: 'WXYZ-1234', refreshToken: 'ref-xyz', tokenExpiresAt: 42 },
      );
      expect(auth.authorizeDevice).toHaveBeenCalledWith({
        userCode: 'WXYZ-1234',
        userId: 'user-1',
        accessToken: 'web-jwt-token',
        refreshToken: 'ref-xyz',
        tokenExpiresAt: 42,
      });
      expect(result).toEqual({ ok: true });
    });

    it('returns 400 when the body is malformed (empty userCode/refreshToken)', async () => {
      await expect(
        controller.deviceAuthorize(FAKE_USER, 'Bearer web-jwt-token', {
          userCode: '',
          refreshToken: '',
          tokenExpiresAt: 0,
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('returns 400 when the service throws (invalid/expired userCode)', async () => {
      auth.authorizeDevice = vi.fn().mockImplementation(() => {
        throw new Error('userCode is invalid or expired');
      });
      await expect(
        controller.deviceAuthorize(FAKE_USER, 'Bearer web-jwt-token', {
          userCode: 'WXYZ-1234',
          refreshToken: 'r',
          tokenExpiresAt: 0,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns 400 when Authorization header is missing the bearer prefix', async () => {
      await expect(
        controller.deviceAuthorize(FAKE_USER, 'broken-header', {
          userCode: 'WXYZ-1234',
          refreshToken: 'r',
          tokenExpiresAt: 0,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('POST /auth/device/deny', () => {
    it('passes userCode to the service', async () => {
      const result = await controller.deviceDeny(FAKE_USER, {
        userCode: 'WXYZ-1234',
      });
      expect(auth.denyDevice).toHaveBeenCalledWith('WXYZ-1234');
      expect(result).toEqual({ ok: true });
    });

    it('returns 400 when userCode is missing from the body', async () => {
      await expect(
        controller.deviceDeny(FAKE_USER, { userCode: '' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns 400 when the service throws (invalid userCode)', async () => {
      auth.denyDevice = vi.fn().mockImplementation(() => {
        throw new Error('userCode is invalid or expired');
      });
      await expect(
        controller.deviceDeny(FAKE_USER, { userCode: 'WXYZ-1234' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });
});
