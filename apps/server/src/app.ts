import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config';
import type { Logger } from './lib/logger';
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
 * - `/auth/refresh` — public
 * - `/auth/device/authorize`, `/auth/device/deny` — Supabase JWT required
 * - `/mcp` — auth handled per-session inside the route (device-flow UX)
 * - `/chat` — Supabase JWT required
 *
 * Middleware is applied per-path (never via `sub.use('*')` on a root-mounted
 * subapp — that would leak auth onto unrelated routes).
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use('*', createCors(deps.config.webOrigins));
  app.onError(errorHandler);

  // Public + auth-scopes-itself modules
  app.route('/', healthRoute);
  app.route('/', createBriefsPublicRoute(deps));
  app.route('/', createCallsRoute(deps));
  app.route('/', createWebhooksRoute(deps));
  app.route('/', createAuthRoute(deps));
  app.route('/', createMcpRoute(deps));

  // /chat — scope auth to this exact path.
  const auth = createAuthMiddleware(deps.supabase);
  const chatSub = new Hono<{ Variables: AuthVariables }>();
  chatSub.use('/chat', auth);
  chatSub.route('/', createChatRoute(deps));
  app.route('/', chatSub);

  return app;
}
