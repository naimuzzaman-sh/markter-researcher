import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';
import {
  listBriefsConfig,
  makeListBriefsHandler,
} from './tools/list-briefs.js';
import {
  getBriefConfig,
  makeGetBriefHandler,
} from './tools/get-brief.js';
import {
  listInterviewsConfig,
  makeListInterviewsHandler,
} from './tools/list-interviews.js';
import {
  getInterviewConfig,
  makeGetInterviewHandler,
} from './tools/get-interview.js';
import {
  previewBriefConfig,
  makePreviewBriefHandler,
} from './tools/preview-brief.js';
import {
  createBriefConfig,
  makeCreateBriefHandler,
} from './tools/create-brief.js';
import {
  updateBriefConfig,
  makeUpdateBriefHandler,
} from './tools/update-brief.js';
import { withAuth } from './tools/with-auth.js';

/**
 * Build an McpServer with all tools registered. Tools capture `client` +
 * `baseUrl` in their handlers at construction time, so they can be invoked
 * without threading them through the SDK's request/response shape.
 */
export function buildServer(client: ApiClient, baseUrl: string): McpServer {
  const server = new McpServer(
    {
      name: 'market-researcher',
      version: '0.1.0',
    },
    {
      instructions:
        'Use `list_briefs` to discover existing research briefs, `get_brief` to inspect one, `list_interviews` / `get_interview` to review completed interviews, and `preview_brief` + `create_brief` (in that order, always with explicit user confirmation) to author a new brief.',
    },
  );

  // Every network-hitting tool is wrapped with `withAuth` so a missing session
  // surfaces as a user-visible "open this URL" message instead of a silent
  // hang or a protocol error. `preview_brief` doesn't hit the API, but we
  // wrap it uniformly to keep the server registration symmetric.
  server.registerTool(
    'list_briefs',
    listBriefsConfig,
    withAuth(makeListBriefsHandler(client, baseUrl)),
  );

  server.registerTool(
    'get_brief',
    getBriefConfig,
    withAuth(makeGetBriefHandler(client, baseUrl)),
  );

  server.registerTool(
    'list_interviews',
    listInterviewsConfig,
    withAuth(makeListInterviewsHandler(client)),
  );

  server.registerTool(
    'get_interview',
    getInterviewConfig,
    withAuth(makeGetInterviewHandler(client)),
  );

  server.registerTool(
    'preview_brief',
    previewBriefConfig,
    withAuth(makePreviewBriefHandler(server, client, baseUrl)),
  );

  server.registerTool(
    'create_brief',
    createBriefConfig,
    withAuth(makeCreateBriefHandler(client, baseUrl)),
  );

  server.registerTool(
    'update_brief',
    updateBriefConfig,
    withAuth(makeUpdateBriefHandler(server, client, baseUrl)),
  );

  return server;
}
