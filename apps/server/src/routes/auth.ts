import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { createAuthMiddleware } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { approveByUserCode, denyByUserCode } from '../lib/auth-flow';

const refreshBody = z.object({ refreshToken: z.string().min(1) });
const authorizeBody = z.object({
  userCode: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenExpiresAt: z.number().int().nonnegative().default(0),
});
const denyBody = z.object({ userCode: z.string().min(1) });

/**
 * Web-side of the device flow: the signed-in user approves/denies a
 * pending MCP session. Pairs with the /mcp route's `resolveAuth` /
 * `waitForAuth` calls — both sides talk to the same `auth-flow` module.
 *
 * - POST /auth/refresh            public; Supabase refresh-token exchange
 * - POST /auth/device/authorize   AUTHED; approves pending session
 * - POST /auth/device/deny        AUTHED; rejects it
 */
export function createAuthRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  const publicApp = new Hono();

  publicApp.post('/auth/refresh', async (c) => {
    const parsed = refreshBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'refreshToken is required');
    try {
      const { data, error } = await deps.supabase.auth.refreshSession({
        refresh_token: parsed.data.refreshToken,
      });
      if (error || !data?.session) {
        throw new AppError('unauthorized', 'Refresh token is invalid or expired');
      }
      return c.json({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        userId: data.session.user.id,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('unauthorized', 'Refresh token is invalid or expired', {
        cause: err,
      });
    }
  });

  // Authed — scoped to specific paths (not `*`) so mounting at '/' doesn't
  // leak the middleware onto unrelated outer-app routes.
  const authedApp = new Hono<{ Variables: AuthVariables }>();
  const auth = createAuthMiddleware(deps.supabase);
  authedApp.use('/auth/device/authorize', auth);
  authedApp.use('/auth/device/deny', auth);

  authedApp.post('/auth/device/authorize', async (c) => {
    const parsed = authorizeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'Invalid authorize body');

    const authHeader = c.req.header('authorization') ?? c.req.header('Authorization') ?? '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) throw new AppError('validation', 'Missing bearer token');

    approveByUserCode(parsed.data.userCode, {
      userId: c.get('userId'),
      accessToken,
      refreshToken: parsed.data.refreshToken,
      expiresAt: parsed.data.tokenExpiresAt,
    });
    return c.json({ ok: true });
  });

  authedApp.post('/auth/device/deny', async (c) => {
    const parsed = denyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'Invalid deny body');
    denyByUserCode(parsed.data.userCode);
    return c.json({ ok: true });
  });

  const app = new Hono<{ Variables: AuthVariables }>();
  app.route('/', publicApp);
  app.route('/', authedApp);
  return app;
}
