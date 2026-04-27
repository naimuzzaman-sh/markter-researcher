import { cors } from 'hono/cors';

/**
 * CORS with an explicit allow-list. No wildcards.
 * MCP Streamable HTTP clients need `Mcp-Session-Id` on both directions
 * (sent by server on init, echoed by client on follow-ups) — include in
 * allow + expose so browser-side MCP clients can read it.
 */
export function createCors(allowedOrigins: string[]) {
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin ?? '') ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Mcp-Session-Id',
      'X-Request-Id',
    ],
    exposeHeaders: ['Mcp-Session-Id', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  });
}
