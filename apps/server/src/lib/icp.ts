import type { Icp } from '@mirrars/shared';

/**
 * ICP label rendering.
 *
 * No semantic judgment lives here. The MCP client driving these
 * tools is itself an LLM with the ICP in context — asking the
 * server's Gemini to judge "is this ICP concrete?" is duplicate
 * work and a wasted token bill. Structural validity (audience
 * non-empty, attribute shape) is enforced by `icpSchema` at the
 * Zod boundary; semantic discipline ("audience must be concrete,
 * ≥3 attributes") lives in the calling tools' descriptions and
 * `MCP_INSTRUCTIONS`. The agent self-checks before invoking
 * `find_candidates`; if the discovery comes back empty / weak,
 * the agent refines the ICP and retries.
 */

/**
 * Render a one-line human label from the structured ICP. Pure
 * formatting — runs on every save in `update_study` /
 * `create_study` so the surface stays in sync with the structured
 * fields without the agent having to hand-craft it on every patch.
 *
 * Format: `audience — attr · attr · geo — truncated problem`.
 * Truncates problem at 80 chars on a word boundary so the label
 * fits a card without wrapping.
 */
export function buildIcpSummary(
  icp: Pick<Icp, 'audience' | 'problem' | 'attributes' | 'geography'>,
): string {
  const audience = icp.audience?.trim() ?? '';
  const attrParts = (icp.attributes ?? [])
    .map((a) => a.value?.trim())
    .filter((v): v is string => !!v);
  if (icp.geography) attrParts.push(icp.geography.trim());
  const attrs = attrParts.join(' · ');
  const problem = truncate(icp.problem?.trim() ?? '', 80);
  return [audience, attrs, problem].filter(Boolean).join(' — ');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}
