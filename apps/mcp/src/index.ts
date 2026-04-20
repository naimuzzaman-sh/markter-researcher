#!/usr/bin/env -S tsx
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { DeviceAuth } from './auth/device-flow.js';
import { ApiClient } from './api-client.js';
import { buildServer } from './server.js';

/**
 * Stdio entry point for the Market Researcher MCP.
 *
 * Boot sequence:
 *   1. Load config (MARKET_RESEARCHER_URL).
 *   2. Wire up ApiClient with a lazy token provider — this does NOT perform
 *      the device-authorization flow yet, so `server.connect()` can finish
 *      the MCP initialize handshake immediately and the host (Claude Code /
 *      Desktop) sees a responsive server.
 *   3. Register tools on an McpServer and connect stdio.
 *   4. On the first tool call, DeviceAuth.ensureSession() either returns the
 *      cached session from ~/.claude/market-researcher-mcp/session.json or
 *      runs the device flow (printing the authorize URL to stderr). That
 *      first call will be slower; all subsequent ones are instant.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const auth = new DeviceAuth(config.baseUrl, config.sessionFile);
  const client = new ApiClient(config.baseUrl, () => auth.getAccessToken());
  const server = buildServer(client, config.baseUrl);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = (signal: string) => {
    process.stderr.write(
      `[market-researcher-mcp] received ${signal}, shutting down.\n`,
    );
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(
    `[market-researcher-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
