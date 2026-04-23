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

export type AppDeps = {
  config: Config;
  logger: Logger;
  supabase: SupabaseClient;
};

/**
 * Build a Hono app with middleware + routes wired. Pure composition — no
 * side effects at import time, no listen. `main.ts` does that so tests
 * can import this module without spawning a server.
 *
 * Route groups:
 * - Public (no auth): /health, GET /briefs/:id (interviewee), POST /calls/*
 *   (interviewee), POST /webhooks/elevenlabs (signed)
 * - Authed (Supabase JWT): POST /chat (and future /mcp/sse, etc.)
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use('*', createCors(deps.config.webOrigins));
  app.onError(errorHandler);

  // Public — no auth
  app.route('/', healthRoute);
  app.route('/', createBriefsPublicRoute(deps));
  app.route('/', createCallsRoute(deps));
  app.route('/', createWebhooksRoute(deps));

  // Authed — Supabase JWT required
  const authed = new Hono<{ Variables: AuthVariables }>();
  authed.use('*', createAuthMiddleware(deps.supabase));
  authed.route('/', createChatRoute(deps));
  authed.route('/', createMcpRoute(deps));
  app.route('/', authed);

  return app;
}
