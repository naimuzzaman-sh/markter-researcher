import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthMiddleware } from './auth';
import { errorHandler } from './error-handler';

function makeSupabase(user: { id: string; email: string } | null, throws = false): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => {
        if (throws) throw new Error('network');
        return user ? { data: { user }, error: null } : { data: { user: null }, error: new Error('invalid') };
      }),
    },
  } as unknown as SupabaseClient;
}

function appWith(supabase: SupabaseClient) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.onError(errorHandler);
  app.use('*', createAuthMiddleware(supabase));
  app.get('/me', (c) => c.json({ userId: c.get('userId') }));
  return app;
}

describe('auth middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches userId on valid Bearer token', async () => {
    const app = appWith(makeSupabase({ id: 'u1', email: 'a@b.com' }));
    const res = await app.request('/me', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'u1' });
  });

  it('returns 401 when Authorization header missing', async () => {
    const app = appWith(makeSupabase({ id: 'u1', email: 'x' }));
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when header is not Bearer', async () => {
    const app = appWith(makeSupabase({ id: 'u1', email: 'x' }));
    const res = await app.request('/me', {
      headers: { Authorization: 'Basic abc' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Supabase rejects the token', async () => {
    const app = appWith(makeSupabase(null));
    const res = await app.request('/me', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Supabase throws (network error)', async () => {
    const app = appWith(makeSupabase(null, true));
    const res = await app.request('/me', {
      headers: { Authorization: 'Bearer x' },
    });
    expect(res.status).toBe(401);
  });
});
