/**
 * Single source of truth for the interviewee-facing URL.
 *
 *   /interview/<briefId>            — anonymous link, used by the brief's
 *                                     "Copy link" pill for general sharing
 *   /interview/<briefId>?cid=<id>   — candidate-tagged link, sent in invites
 *                                     so completed interviews attribute back
 *                                     to the candidate row
 *
 * Built from `webOrigin` so MCP clients (which have no browser context)
 * get the same URL the web client would.
 */
export function buildInterviewUrl(
  webOrigin: string,
  briefId: string,
  candidateId?: string,
): string {
  const base = `${webOrigin.replace(/\/+$/, '')}/interview/${briefId}`;
  return candidateId ? `${base}?cid=${candidateId}` : base;
}
