import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { createAuthMiddleware } from '../middleware/auth';
import { AppError } from '../lib/errors';
import type { DeviceFlow } from '../lib/device-flow';

const refreshBody = z.object({ refreshToken: z.string().min(1) });
const authorizeBody = z.object({
  userCode: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenExpiresAt: z.number().int().nonnegative().default(0),
});
const denyBody = z.object({ userCode: z.string().min(1) });

/**
 * Auth HTTP surface — shares the `DeviceFlow` singleton with `/mcp` so an
 * MCP session starts a flow (in /mcp) and the web approves it (here).
 *
 * - POST   /auth/refresh            public; Supabase refresh-token exchange
 * - POST   /auth/device/authorize   AUTHED; web hands signed-in session → device
 * - POST   /auth/device/deny        AUTHED; web rejects
 *
 * Note: `/auth/device/start` and `/auth/device/poll` USED to live here for
 * the old `apps/mcp` stdio bridge. In the new topology the MCP server at
 * /mcp handles start/poll internally against the session id, so those
 * endpoints are no longer needed.
 */
export function createAuthRoute(deps: {
  device: DeviceFlow;
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  // Public routes
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

  // Authed routes — web-only, signed-in user authorizes/denies.
  // Scope the auth middleware to these specific paths (not '*') so that
  // mounting this sub-app at '/' doesn't accidentally gate unrelated
  // routes on the outer app.
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

    deps.device.authorize({
      userCode: parsed.data.userCode,
      userId: c.get('userId'),
      accessToken,
      refreshToken: parsed.data.refreshToken,
      tokenExpiresAt: parsed.data.tokenExpiresAt,
    });
    return c.json({ ok: true });
  });

  authedApp.post('/auth/device/deny', async (c) => {
    const parsed = denyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('validation', 'Invalid deny body');
    deps.device.deny(parsed.data.userCode);
    return c.json({ ok: true });
  });

  const app = new Hono<{ Variables: AuthVariables }>();
  app.route('/', publicApp);
  app.route('/', authedApp);
  return app;
}
