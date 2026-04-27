import type { ToolRegistry } from './types';
import { listBriefsTool } from './list-briefs';
import { getBriefTool } from './get-brief';
import { createBriefTool } from './create-brief';
import { updateBriefTool } from './update-brief';
import { previewBriefTool } from './preview-brief';
import { listInterviewsTool } from './list-interviews';
import { getInterviewTool } from './get-interview';
import { findCandidatesTool } from './find-candidates';
import { getJobStatusTool } from './get-job-status';
import { listCandidatesForBriefTool } from './list-candidates-for-brief';
import { getCandidateTool } from './get-candidate';
import { approveCandidateTool } from './approve-candidate';
import { rejectCandidateTool } from './reject-candidate';
import { inviteCandidateTool } from './invite-candidate';
import { listContactsTool } from './list-contacts';
import { getContactTool } from './get-contact';

/**
 * Central tool registry. Both the /chat agent loop and the /mcp/sse MCP
 * server iterate this map to register the same set of tools.
 * Add a new tool = one line here + one file next to it. No duplicated
 * handler code per transport.
 */
export const tools: ToolRegistry = {
  [listBriefsTool.name]: listBriefsTool,
  [getBriefTool.name]: getBriefTool,
  [createBriefTool.name]: createBriefTool,
  [updateBriefTool.name]: updateBriefTool,
  [previewBriefTool.name]: previewBriefTool,
  [listInterviewsTool.name]: listInterviewsTool,
  [getInterviewTool.name]: getInterviewTool,
  [findCandidatesTool.name]: findCandidatesTool,
  [getJobStatusTool.name]: getJobStatusTool,
  [listCandidatesForBriefTool.name]: listCandidatesForBriefTool,
  [getCandidateTool.name]: getCandidateTool,
  [approveCandidateTool.name]: approveCandidateTool,
  [rejectCandidateTool.name]: rejectCandidateTool,
  [inviteCandidateTool.name]: inviteCandidateTool,
  [listContactsTool.name]: listContactsTool,
  [getContactTool.name]: getContactTool,
} as const;

export type { Tool, ToolCtx, ToolRegistry } from './types';
