import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import type { ZodRawShape } from 'zod';
import { forgetSession, resolveAuth, waitForAuth } from '../lib/auth-flow';
import { MCP_INSTRUCTIONS } from '../lib/mcp-instructions';
import { tools as toolRegistry } from '../tools/index';
import type { Tool } from '../tools/types';

// Max time to keep the tool call open during URL-based elicitation.
// User can take as long as they need — we wake early on approve.
const AUTH_WAIT_MS = 5 * 60_000;

/**
 * Build a tool result that surfaces the auth verification URL in two
 * complementary ways:
 *   1. A markdown link in the text content — agents like Claude Code
 *      render this as clickable in their chat UI, so the user can
 *      one-click open the page even when url-mode elicitation isn't
 *      supported.
 *   2. A `resource_link` content block — MCP-native clickable widget
 *      (Cursor, Claude Code render as a card with an "Open" button).
 *
 * Used both as the immediate short-circuit when url-mode elicitation
 * is rejected by the client, and as the timeout fallback when the
 * user hasn't approved within AUTH_WAIT_MS.
 */
function clickableAuthFallback(verificationUri: string, userCode: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text:
          `Mirars needs authorization. Open this link, sign in, and click **Approve**, then retry the tool:\n\n` +
          `[${verificationUri}](${verificationUri})\n\n` +
          `Verification code: \`${userCode}\``,
      },
      {
        type: 'resource_link' as const,
        uri: verificationUri,
        name: `Authorize Mirars (${userCode})`,
        description: `Opens the Mirars authorize page. Verification code: ${userCode}`,
      },
    ],
  };
}

/**
 * MCP server over Streamable HTTP.
 *
 * Auth (device-flow UX ported from old apps/mcp, now server-side):
 *   1. First tool call on a fresh session → server starts a flow, returns
 *      the verification URL immediately as a `resource_link` (native
 *      clickable widget in Claude Code / Cursor).
 *   2. User clicks → web `/authorize/:userCode` → POST /auth/device/authorize
 *      → `approveByUserCode()` → all waiters on that session wake up.
 *   3. Second tool call → `waitForAuth` blocks on the push signal. Wakes
 *      instantly when the user approves; times out after 60s with a pending
 *      response; returns tool result when authorized.
 *   4. Tokens refresh transparently via `resolveAuth` when near expiry.
 *
 * No Authorization header in `.mcp.json` — server caches tokens per
 * `Mcp-Session-Id`. Claude Code / Cursor config:
 *   { "type": "http", "url": "https://<deployed>/mcp" }
 */
export function createMcpRoute(deps: {
  supabase: SupabaseClient;
  config: Config;
  logger: Logger;
}) {
  const app = new Hono();
  const webBase = deps.config.webOrigin;

  const sessions = new Map<
    string,
    { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }
  >();

  async function buildServer() {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        deps.logger.info('mcp session initialized', { sessionId: sid });
      },
      onsessionclosed: async (sid) => {
        sessions.delete(sid);
        forgetSession(sid);
        deps.logger.info('mcp session closed', { sessionId: sid });
      },
    });

    const server = new McpServer(
      { name: 'mirars', version: '0.1.0' },
      { instructions: MCP_INSTRUCTIONS },
    );

    for (const tool of Object.values(toolRegistry) as Tool[]) {
      // All tools in the registry wrap a ZodObject — pull the shape typed
      // as ZodRawShape so registerTool picks the `(args, extra) => ...`
      // handler signature (if this stays `never`/`undefined`, TS expects
      // a 1-arg handler, breaking the sendNotification call below).
      const rawShape = (tool.inputSchema as unknown as { shape: ZodRawShape })
        .shape;

      server.registerTool(
        tool.name,
        {
          title: tool.name,
          description: tool.description,
          inputSchema: rawShape,
        },
        async (args, extra) => {
          const sid = transport.sessionId;
          if (!sid) {
            return {
              content: [
                { type: 'text' as const, text: 'MCP session not initialized yet.' },
              ],
              isError: true,
            };
          }

          // Resolve: either we get tokens (authorized) or we (re)start a flow
          // and get a pending URL.
          let auth = await resolveAuth(sid, webBase, deps.supabase);

          if (auth.kind === 'pending') {
            // Send a URL-based elicitation to the client (Claude Code / Cursor
            // render this as a native dialog with a clickable link + Continue
            // button) AND simultaneously wait for the push signal from
            // /auth/device/authorize. Whichever resolves first wins.
            //
            // If the client rejects url-mode (-32602), we want to short-
            // circuit IMMEDIATELY — show the user a clickable link rather
            // than silently waiting AUTH_WAIT_MS for a push signal they
            // can't trigger because they don't know there's an auth flow.
            let urlModeUnsupported = false;
            const elicitation = extra
              .sendRequest(
                {
                  method: 'elicitation/create',
                  params: {
                    mode: 'url',
                    message:
                      'Open the link, sign in to the web app, click Approve, then Continue.',
                    elicitationId: randomUUID(),
                    url: auth.verificationUri,
                  },
                },
                ElicitResultSchema,
              )
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                // Standard rejection from clients without url-mode support
                // (e.g. older Claude Code, Cursor, third-party MCP clients).
                if (/-32602|url-mode/i.test(msg)) {
                  urlModeUnsupported = true;
                } else {
                  deps.logger.warn(
                    'elicitation failed — falling back to push wait',
                    { err },
                  );
                }
                return null;
              });

            const pushSignal = waitForAuth(sid, AUTH_WAIT_MS);
            await Promise.race([elicitation, pushSignal]);

            // Either the user clicked Continue in the dialog OR the web
            // approval pushed through OR the elicitation rejected fast.
            auth = await resolveAuth(sid, webBase, deps.supabase);

            // If url-mode isn't supported, the elicitation rejection
            // landed fast and the race is over — surface a clickable
            // resource_link + markdown URL right away rather than burning
            // the rest of the AUTH_WAIT_MS budget on a silent wait.
            if (urlModeUnsupported && auth.kind === 'pending') {
              return clickableAuthFallback(auth.verificationUri, auth.userCode);
            }
          }

          if (auth.kind === 'pending') {
            // Fallback: elicitation cancelled / timed out without approval.
            return clickableAuthFallback(auth.verificationUri, auth.userCode);
          }
          if (auth.kind === 'denied') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Authorization was denied. Retry this tool to start a new authorization flow.',
                },
              ],
              isError: true,
            };
          }

          try {
            const parsed = tool.inputSchema.parse(args);
            const result = await tool.execute(parsed, {
              userId: auth.userId,
              // MCP device-flow doesn't currently surface the user's
              // email on the session; downstream tools fall back to
              // RESEND_FROM_EMAIL for Reply-To when this is null.
              userEmail: null,
              supabase: deps.supabase,
              config: deps.config,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    typeof result === 'string' ? result : JSON.stringify(result, null, 2),
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
    if (!entry) entry = await buildServer();
    const response = await entry.transport.handleRequest(c.req.raw);
    if (!sessionId && entry.transport.sessionId) {
      sessions.set(entry.transport.sessionId, entry);
    }
    return response;
  });

  return app;
}
