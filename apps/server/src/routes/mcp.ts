import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { AuthVariables } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { tools as toolRegistry } from '../tools/index';
import type { Tool } from '../tools/types';

/**
 * MCP server over Streamable HTTP. Same tool registry as `/chat` — every tool
 * is registered verbatim, with one dispatcher that parses the input schema
 * and calls `tool.execute(args, ctx)`. Zero per-tool handler duplication.
 *
 * Auth: reuses `createAuthMiddleware` upstream, so `c.get('userId')` is
 * guaranteed populated by the time we enter this handler.
 *
 * Sessions: stateful — SDK generates a session id per MCP client connection.
 * Each session has its own transport + McpServer so closures capture the
 * authenticated user id at connect time.
 */
export function createMcpRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // sessionId → { transport, server }. Kept in-memory; good enough for a
  // single-process deploy. If we ever scale horizontally, move to Redis-backed
  // session store (the SDK exposes EventStore for resumability).
  const sessions = new Map<
    string,
    { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }
  >();

  async function buildServerForUser(userId: string): Promise<{
    transport: WebStandardStreamableHTTPServerTransport;
    server: McpServer;
  }> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        deps.logger.info('mcp session initialized', { sessionId: sid, userId });
      },
      onsessionclosed: async (sid) => {
        sessions.delete(sid);
        deps.logger.info('mcp session closed', { sessionId: sid, userId });
      },
    });

    const server = new McpServer(
      { name: 'market-researcher', version: '0.1.0' },
      {
        instructions: `This MCP server exposes the market-researcher tool surface. All tools run under the authenticated user (userId=${userId}); Supabase queries are automatically owner-scoped. Use \`list_briefs\` to start.`,
      },
    );

    for (const tool of Object.values(toolRegistry) as Tool[]) {
      server.registerTool(
        tool.name,
        {
          title: tool.name,
          description: tool.description,
          // McpServer accepts ZodRawShape — unwrap if the schema is a ZodObject.
          inputSchema:
            'shape' in tool.inputSchema &&
            typeof (tool.inputSchema as { shape?: unknown }).shape === 'object'
              ? (tool.inputSchema as unknown as { shape: Record<string, unknown> }).shape as never
              : undefined,
        },
        async (args: unknown) => {
          try {
            const parsed = tool.inputSchema.parse(args);
            const result = await tool.execute(parsed, {
              userId,
              supabase: deps.supabase,
              config: deps.config,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: 'text' as const, text: `Error: ${message}` }],
              isError: true,
            };
          }
        },
      );
    }

    await server.connect(transport);
    return { transport, server };
  }

  // Single `/mcp` endpoint — the SDK's streamable-http transport handles GET
  // (SSE stream) / POST (JSON-RPC request) / DELETE (session close) on the
  // same path, switching based on HTTP method.
  app.all('/mcp', async (c) => {
    const userId = c.get('userId');
    if (!userId) throw new AppError('unauthorized', 'userId missing from context');

    const sessionId = c.req.header('mcp-session-id');

    let entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) {
      // First contact from a new client — build a transport + server for them.
      entry = await buildServerForUser(userId);
      // After handleRequest runs the initialize handshake, the transport
      // will have a sessionId; store it then.
    }

    const response = await entry.transport.handleRequest(c.req.raw);

    // On init handshake, sessionId is now populated — remember for later.
    if (!sessionId && entry.transport.sessionId) {
      sessions.set(entry.transport.sessionId, entry);
    }

    return response;
  });

  return app;
}
