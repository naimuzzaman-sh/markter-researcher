import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config';
import type { Logger } from './lib/logger';
import { createCors } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { createAuthMiddleware, type AuthVariables } from './middleware/auth';
import { healthRoute } from './routes/health';
import { createChatRoute } from './routes/chat';
import { createRunToolRoute } from './routes/run-tool';
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
 * - `/chat` — Supabase JWT required (LLM-driven, free-form messages)
 * - `/run-tool` — Supabase JWT required (deterministic, pill-click tool execution)
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

  // Authed routes — scope auth to specific paths so mounting at '/' doesn't
  // leak the middleware onto unrelated outer-app routes.
  const auth = createAuthMiddleware(deps.supabase);
  const authedSub = new Hono<{ Variables: AuthVariables }>();
  authedSub.use('/chat', auth);
  authedSub.use('/run-tool', auth);
  authedSub.route('/', createChatRoute(deps));
  authedSub.route('/', createRunToolRoute(deps));
  app.route('/', authedSub);

  return app;
}
