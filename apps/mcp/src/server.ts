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
import
  findCandidatesConfig,
  makeFindCandidatesHandler,
} from './tools/find-candidates.js';
import {
  getJobStatusConfig,
  makeGetJobStatusHandler,
} from './tools/get-job-status.js';
import {
  listCandidatesForBriefConfig,
  makeListCandidatesForBriefHandler,
} from './tools/list-candidates-for-brief.js';
import {
  getCandidateConfig,
  makeGetCandidateHandler,
} from './tools/get-candidate.js';
import {
  approveCandidateConfig,
  makeApproveCandidateHandler,
} from './tools/approve-candidate.js';
import {
  rejectCandidateConfig,
  makeRejectCandidateHandler,
} from './tools/reject-candidate.js';
import {
  listContactsConfig,
  makeListContactsHandler,
} from './tools/list-contacts.js';
import {
  getContactConfig,
  makeGetContactHandler,
} from './tools/get-contact.js';
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
      version: '0.2.0',
    },
    {
      instructions: [
        'Use `list_briefs` to discover existing research briefs, `get_brief` to inspect one, `list_interviews` / `get_interview` to review completed interviews, and `preview_brief` + `create_brief` (in that order, always with explicit user confirmation) to author a new brief.',
        '',
        'Network-lens discovery flow:',
        '1. `find_candidates({ briefId })` — kicks off an async EXA+LinkedIn search for people matching the brief\'s target audience. Returns a jobId.',
        '2. `get_job_status({ jobId })` — poll until status is `succeeded`.',
        '3. `list_candidates_for_brief({ briefId })` — see the discovered people. Each has `status: pending_review`.',
        '4. `get_contact({ contactId })` — inspect one person\'s full profile.',
        '5. `approve_candidate({ candidateId })` or `reject_candidate({ candidateId })` — advance the funnel.',
        '',
        '`list_contacts` returns the org-wide contact roster across all briefs.',
      ].join('\n'),
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
  // Network-lens: discovery → review → approve → (later) outreach/interview
  server.registerTool(
    'find_candidates',
    findCandidatesConfig,
    withAuth(makeFindCandidatesHandler(client)),
  );

  server.registerTool(
    'get_job_status',
    getJobStatusConfig,
    withAuth(makeGetJobStatusHandler(client)),
  );

  server.registerTool(
    'list_candidates_for_brief',
    listCandidatesForBriefConfig,
    withAuth(makeListCandidatesForBriefHandler(client)),
  );

  server.registerTool(
    'get_candidate',
    getCandidateConfig,
    withAuth(makeGetCandidateHandler(client)),
  );

  server.registerTool(
    'approve_candidate',
    approveCandidateConfig,
    withAuth(makeApproveCandidateHandler(client)),
  );

  server.registerTool(
    'reject_candidate',
    rejectCandidateConfig,
    withAuth(makeRejectCandidateHandler(client)),
  );

  server.registerTool(
    'list_contacts',
    listContactsConfig,
    withAuth(makeListContactsHandler(client)),
  );

  server.registerTool(
    'get_contact',
    getContactConfig,
    withAuth(makeGetContactHandler(client)),
  );

  return server;
}
