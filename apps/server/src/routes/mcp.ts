import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { DeviceFlow } from '../lib/device-flow';
import { SessionAuthStore } from '../lib/session-auth';
import { tools as toolRegistry } from '../tools/index';
import type { Tool } from '../tools/types';

/**
 * MCP server over Streamable HTTP.
 *
 * Auth (mirrors the old `apps/mcp` DeviceAuth UX):
 *   - First tool call with no session auth → tool returns TEXT telling the
 *     user "Open this URL to authorize". Device-flow state is stashed on
 *     the Mcp-Session-Id so the next call can resume.
 *   - User opens URL → web `/authorize/:userCode` page approves → server
 *     stores tokens on the pending device.
 *   - Retry the tool → session auth polls, finds authorized, runs the tool.
 *   - Tokens refresh transparently via Supabase when near expiry; no user
 *     action needed until the refresh token itself is revoked.
 *
 * No Authorization header on client .mcp.json — server-side session cache
 * handles everything. Claude Code / Cursor just need:
 *   { "type": "http", "url": "https://<deployed>/mcp" }
 */
export function createMcpRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
  device: DeviceFlow;
}) {
  const app = new Hono();

  const sessionAuth = new SessionAuthStore(deps.device, deps.supabase);
  const webBase = deps.config.webOrigins[0] ?? 'http://localhost:5173';

  // sessionId → { transport, server }. In-memory; single-instance only.
  const sessions = new Map<
    string,
    { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }
  >();

  async function buildServer(): Promise<{
    transport: WebStandardStreamableHTTPServerTransport;
    server: McpServer;
  }> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        deps.logger.info('mcp session initialized', { sessionId: sid });
      },
      onsessionclosed: async (sid) => {
        sessions.delete(sid);
        sessionAuth.forget(sid);
        deps.logger.info('mcp session closed', { sessionId: sid });
      },
    });

    const server = new McpServer(
      { name: 'market-researcher', version: '0.1.0' },
      {
        instructions:
          'Market researcher tools. On first use you\'ll get a URL to authorize in your browser — open it, click Approve, then retry the tool.',
      },
    );

    for (const tool of Object.values(toolRegistry) as Tool[]) {
      server.registerTool(
        tool.name,
        {
          title: tool.name,
          description: tool.description,
          inputSchema:
            'shape' in tool.inputSchema &&
            typeof (tool.inputSchema as { shape?: unknown }).shape === 'object'
              ? (tool.inputSchema as unknown as { shape: Record<string, unknown> }).shape as never
              : undefined,
        },
        async (args: unknown) => {
          const sid = transport.sessionId;
          if (!sid) {
            return {
              content: [
                { type: 'text' as const, text: 'MCP session not initialized yet.' },
              ],
              isError: true,
            };
          }

          const auth = await sessionAuth.resolve(sid, webBase);

          if (auth.kind === 'pending') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Authorization required. Open this URL in your browser (signed in to the web app) and click Approve, then retry this tool:\n\n    ${auth.verificationUri}\n\n(Verification code: ${auth.userCode})`,
                },
              ],
            };
          }
          if (auth.kind === 'denied') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Authorization was denied in the browser. Retry this tool to start a new authorization flow.',
                },
              ],
              isError: true,
            };
          }

          // authorized — run the tool
          try {
            const parsed = tool.inputSchema.parse(args);
            const result = await tool.execute(parsed, {
              userId: auth.userId,
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

  app.all('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    let entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) {
      entry = await buildServer();
    }
    const response = await entry.transport.handleRequest(c.req.raw);
    if (!sessionId && entry.transport.sessionId) {
      sessions.set(entry.transport.sessionId, entry);
    }
    return response;
  });

  return app;
}
