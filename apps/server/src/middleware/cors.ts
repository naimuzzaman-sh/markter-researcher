import { cors } from 'hono/cors';

/**
 * CORS with an explicit allow-list. No wildcards.
 * SSE needs `Authorization` and `Content-Type` in allowed headers;
 * MCP SSE clients set these on the initial GET.
 */
export function createCors(allowedOrigins: string[]) {
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin ?? '') ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  });
}
