import type { ToolRegistry } from './types';
import { listStudiesTool } from './list-studies';
import { getStudyTool } from './get-study';
import { createStudyTool } from './create-study';
import { updateStudyTool } from './update-study';
import { previewStudyTool } from './preview-study';
import { regenerateStudyResultsTool } from './regenerate-study-results';
import { getInterviewLinkTool } from './get-interview-link';
import { listInterviewsTool } from './list-interviews';
import { getInterviewTool } from './get-interview';
import { findCandidatesTool } from './find-candidates';
import { getJobStatusTool } from './get-job-status';
import { listCandidatesForStudyTool } from './list-candidates-for-study';
import { getCandidateTool } from './get-candidate';
import { approveCandidateTool } from './approve-candidate';
import { rejectCandidateTool } from './reject-candidate';
import { inviteCandidateTool } from './invite-candidate';
import { listContactsTool } from './list-contacts';
import { getContactTool } from './get-contact';
import { getDashboardTool } from './get-dashboard';

/**
 * Central tool registry. Both the /chat agent loop and the /mcp/sse MCP
 * server iterate this map to register the same set of tools.
 * Add a new tool = one line here + one file next to it. No duplicated
 * handler code per transport.
 */
export const tools: ToolRegistry = {
  [listStudiesTool.name]: listStudiesTool,
  [getStudyTool.name]: getStudyTool,
  [createStudyTool.name]: createStudyTool,
  [updateStudyTool.name]: updateStudyTool,
  [previewStudyTool.name]: previewStudyTool,
  [regenerateStudyResultsTool.name]: regenerateStudyResultsTool,
  [getInterviewLinkTool.name]: getInterviewLinkTool,
  [listInterviewsTool.name]: listInterviewsTool,
  [getInterviewTool.name]: getInterviewTool,
  [findCandidatesTool.name]: findCandidatesTool,
  [getJobStatusTool.name]: getJobStatusTool,
  [listCandidatesForStudyTool.name]: listCandidatesForStudyTool,
  [getCandidateTool.name]: getCandidateTool,
  [approveCandidateTool.name]: approveCandidateTool,
  [rejectCandidateTool.name]: rejectCandidateTool,
  [inviteCandidateTool.name]: inviteCandidateTool,
  [listContactsTool.name]: listContactsTool,
  [getContactTool.name]: getContactTool,
  [getDashboardTool.name]: getDashboardTool,
} as const;

export type { Tool, ToolCtx, ToolRegistry } from './types';
