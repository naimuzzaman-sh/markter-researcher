import type { Context } from 'hono';
import { AppError, httpStatusFor, toErrorBody } from '../lib/errors';

/**
 * Central error handler. Hono's `app.onError(errorHandler)` installs it.
 * Known `AppError` → mapped status + typed body. Unknown errors →
 * 500 with generic message; the raw error is logged to stderr (never
 * returned to the client) so it shows up in server logs for debugging.
 */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    // AppErrors are intentional + client-appropriate; log at info/warn for audit.
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        msg: 'app error',
        code: err.code,
        message: err.message,
        path: c.req.path,
        method: c.req.method,
      })}\n`,
    );
    return c.json(toErrorBody(err), { status: httpStatusFor(err.code) as never });
  }
  // Unknown — log the full stack, return generic.
  process.stderr.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'unhandled error',
      path: c.req.path,
      method: c.req.method,
      err: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
    })}\n`,
  );
  return c.json(toErrorBody(err), { status: 500 });
}
