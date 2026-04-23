import 'dotenv/config';
import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { createLogger } from './lib/logger';
import { createSupabaseClient } from './lib/supabase';
import { createApp } from './app';

/**
 * Entry point: load + validate config, build app, listen.
 * Graceful shutdown on SIGINT/SIGTERM so we don't drop in-flight requests
 * during a Railway redeploy or a Ctrl-C in dev.
 */
function main(): void {
  const config = loadConfig();
  const logger = createLogger({ service: 'server' });
  const supabase = createSupabaseClient(config);
  const app = createApp({ config, logger, supabase });

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      logger.info(`server listening`, { port: info.port, env: config.nodeEnv });
    },
  );

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
    // Belt + suspenders: force-exit after 10s if close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
