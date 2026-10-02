/**
 * Single source of truth for the interviewee-facing URL.
 *
 *   /interview/<studyId>            — anonymous link, used by the study's
 *                                     "Copy link" pill for general sharing
 *   /interview/<studyId>?cid=<id>   — candidate-tagged link, sent in invites
 *                                     so completed interviews attribute back
 *                                     to the candidate row
 *
 * URL prefix `/interview/` stays — that's the user-facing public path.
 * The id segment was historically a briefId; it's still the same uuid,
 * just renamed to studyId to match the codebase.
 *
 * Built from `webOrigin` so MCP clients (which have no browser context)
 * get the same URL the web client would.
 */
export function buildInterviewUrl(
  webOrigin: string,
  studyId: string,
  candidateId?: string,
): string {
  const base = `${webOrigin.replace(/\/+$/, '')}/interview/${studyId}`;
  return candidateId ? `${base}?cid=${candidateId}` : base;
}
