import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import type { SupabaseService } from '../persistence/supabase.service';

const buildContext = (headers: Record<string, string>): ExecutionContext => {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

describe('JwtGuard', () => {
  let supabase: SupabaseService;
  let guard: JwtGuard;

  beforeEach(() => {
    supabase = {
      getUserFromJwt: vi.fn(),
    } as unknown as SupabaseService;
    guard = new JwtGuard(supabase);
  });

  it('accepts a valid Bearer token, attaches user to request', async () => {
    supabase.getUserFromJwt = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      phone: null,
    });
    const ctx = buildContext({ authorization: 'Bearer good-token' });

    const ok = await guard.canActivate(ctx);

    expect(ok).toBe(true);
    expect(supabase.getUserFromJwt).toHaveBeenCalledWith('good-token');
    const req = ctx.switchToHttp().getRequest();
    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.com', phone: null });
  });

  it('accepts case-insensitive Authorization header name', async () => {
    supabase.getUserFromJwt = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: null,
      phone: null,
    });
    // lowercase header name (what Express actually passes through)
    const ctx = buildContext({ Authorization: 'Bearer good-token' });

    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
  });

  it('rejects when no Authorization header', async () => {
    const ctx = buildContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when header is not Bearer-scheme', async () => {
    const ctx = buildContext({ authorization: 'Basic abc' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when Supabase returns null user (invalid/expired token)', async () => {
    supabase.getUserFromJwt = vi.fn().mockResolvedValue(null);
    const ctx = buildContext({ authorization: 'Bearer bad' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when bearer token is empty', async () => {
    const ctx = buildContext({ authorization: 'Bearer ' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
