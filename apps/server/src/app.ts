import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config';
import type { Logger } from './lib/logger';
import { DeviceFlow } from './lib/device-flow';
import { createCors } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { createAuthMiddleware, type AuthVariables } from './middleware/auth';
import { healthRoute } from './routes/health';
import { createChatRoute } from './routes/chat';
import { createMcpRoute } from './routes/mcp';
import { createBriefsPublicRoute } from './routes/briefs-public';
import { createCallsRoute } from './routes/calls';
import { createWebhooksRoute } from './routes/webhooks';
import { createAuthRoute } from './routes/auth';

export type AppDeps = {
  config: Config;
  logger: Logger;
  supabase: SupabaseClient;
};

/**
 * Compose the Hono app.
 *
 * - `/health`, `/briefs/:id`, `/calls/*`, `/webhooks/*` — public
 * - `/auth/*` — module scopes its own auth
 * - `/mcp` — auth handled per-session inside the route (device-flow UX)
 * - `/chat` — requires Supabase JWT from the signed-in web user
 *
 * We deliberately apply auth middleware INSIDE the chat sub-app (via
 * `subapp.use(...)`) instead of mounting a `.use('*')` subapp at root.
 * Hono's `app.route('/', authedSub)` would make the sub-app's wildcard
 * middleware run for every path on the outer app, gating /mcp + public
 * routes by accident.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const device = new DeviceFlow();

  app.use('*', createCors(deps.config.webOrigins));
  app.onError(errorHandler);

  // Public
  app.route('/', healthRoute);
  app.route('/', createBriefsPublicRoute(deps));
  app.route('/', createCallsRoute(deps));
  app.route('/', createWebhooksRoute(deps));
  app.route('/', createAuthRoute({ ...deps, device }));
  app.route('/', createMcpRoute({ ...deps, device }));

  // Authed — middleware applied directly to the route, not via a sub-app.
  const auth = createAuthMiddleware(deps.supabase);
  const chatApp = createChatRoute(deps);
  // Re-wrap: prepend auth middleware to every handler on chatApp before mount.
  // Hono doesn't have a `.mountWithMiddleware` helper, so we express it as a
  // tiny inline sub-app that uses auth only for its own routes.
  const chatAuthed = new Hono<{ Variables: AuthVariables }>();
  chatAuthed.use('/chat', auth);
  chatAuthed.use('/chat/*', auth);
  chatAuthed.route('/', chatApp);
  app.route('/', chatAuthed);

  return app;
}
