/**
 * Server-side `instructions` text returned in the MCP `initialize`
 * response. Both displayed in the client's MCP UI (Claude Code, Cursor)
 * and prepended to the model's context — so the agent knows the tool
 * surface without us repeating it inside SYSTEM_PROMPT.
 */

export const MCP_INSTRUCTIONS = `Mirars — research interviews on autopilot.

Use these tools to:
  • Create or refine research briefs (\`preview_brief\` → \`create_brief\` → \`update_brief\`).
  • Discover interview candidates (\`find_candidates\` → poll \`get_job_status\` → \`list_candidates_for_brief\` → \`approve_candidate\` / \`reject_candidate\`).
  • Invite approved candidates to a voice interview (\`invite_candidate\`).
  • Browse contacts and past interviews (\`list_contacts\`, \`list_interviews\`, \`get_interview\`).
  • Get a workspace snapshot (\`get_dashboard\`).

Example prompts:
  • "List my briefs"
  • "Find candidates for the <brief name> brief"
  • "Approve <candidate name> for that brief"
  • "Show me <contact name>'s interview"

First use: the first tool call returns a verification URL. Open it in your browser, sign in, click Approve, then retry the tool — the session is then authorized for ~1 hour.`;
