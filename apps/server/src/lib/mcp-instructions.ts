/**
 * Server-side `instructions` text returned in the MCP `initialize`
 * response. Both displayed in the client's MCP UI (Claude Code, Cursor)
 * and prepended to the model's context — so the agent knows the tool
 * surface without us repeating it inside SYSTEM_PROMPT.
 */

export const MCP_INSTRUCTIONS = `Mirars — research interviews on autopilot.

Use these tools to:
  • Create or refine research studies (\`preview_study\` → \`create_study\` → \`update_study\`).
  • Discover interview candidates (\`find_candidates\` → poll \`get_job_status\` → \`list_candidates_for_study\` → \`approve_candidate\` / \`reject_candidate\`).
  • Invite approved candidates to a voice interview (\`invite_candidate\`) or grab a shareable interview link (\`get_interview_link\`).
  • Read the cross-interview synthesis on a study (\`get_study\`.\`results\`) or refresh it on demand (\`regenerate_study_results\`).
  • Browse contacts and past interviews (\`list_contacts\`, \`list_interviews\`, \`get_interview\`).
  • Get a workspace snapshot (\`get_dashboard\`).

Each study has a lifecycle (\`draft\` while being assembled, \`active\` once promoted) and accumulates a \`results\` payload — an aggregated synthesis (themes, painPoints, pmfSignalsObserved, recommendations, summary, interviewCount) computed across all completed interviews. \`get_study\` returns it inline; it auto-refreshes after every successful interview, and \`regenerate_study_results\` can force a refresh.

DRAFT → ACTIVE FLOW (read this before \`create_study\`):
  1. Don't call \`create_study\` with empty fields. Minimum: company name AND product name. A bare "create a study" with no specifics → ask the user for the company first; do NOT create an empty row.
  2. As the user provides info, call \`update_study({ studyId, patch })\` to layer it onto the draft. Never call \`update_study\` with an empty patch — phantom updates erode trust ("I've updated the study" with no actual change).
  3. ICP is structured, not freeform. \`product.icp\` has fields: \`audience\` (concrete role/persona, not "people"), \`problem\` (specific pain), \`attributes\` (≥3 concrete dimensions — name + value pairs the agent picks per domain), optional \`geography\` / \`signals\` / \`excludes\`. \`summary\` is auto-rendered server-side; you don't write it. Pick attribute dimension names that fit the domain:
     • B2B/professional → role / industry / companyStage / techStack / teamSize
     • B2C/consumer → ageRange / lifeStage / lifestyle / context / primaryGoal
     • Healthcare → condition / treatmentStage / caregiverOrPatient / region
     • Creator/freelance → platform / audienceSize / niche / revenueBand
     • Education → role / gradeLevel / subject / institutionType / yearsExperience
     • Civic/public → role / department / jurisdiction / techEnvironment
     Don't force a B2B mental model onto a B2C product or vice versa. **You self-judge ICP concreteness before \`find_candidates\`** — the server only checks structural shape, since the calling agent (you) already has the ICP in context. Read \`product.icp\`, confirm \`audience\` is concrete, \`problem\` is specific, \`attributes\` has ≥3 non-generic entries; if thin, refine via \`update_study\` first.
  4. DRAFT, don't extract: questions (5–8 grouped by category), pmfSignals (3–5), concerns (2–4), tone/language/duration — all of these are YOUR job to draft based on product+ICP. Don't ask the user to invent them.
  5. Only call \`preview_study\` when ALL fields are populated INCLUDING a thick ICP. The promotion gate is server-side: \`update_study({ status: 'active' })\` rejects incomplete drafts.
  6. After the user confirms the preview ("yes", "looks good", "create it" all count as full confirmation), call \`update_study({ studyId, status: 'active' })\` to promote.

Example prompts:
  • "List my studies"
  • "Find candidates for the <study name> study"
  • "Approve <candidate name> for that study"
  • "Get the interview link for <study name>"
  • "Show me the results for the <study name> study"
  • "Refresh the results on <study name>"
  • "Show me <contact name>'s interview"

First use: the first tool call returns a verification URL. Open it in your browser, sign in, click Approve, then retry the tool — the session is then authorized for ~1 hour.`;
