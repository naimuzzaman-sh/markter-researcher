/**
 * Helpers for sanitizing the per-query relevance excerpts that the
 * discovery flow stashes on `contacts.profile_json.highlights`.
 *
 * Exa's `/search` endpoint returns highlights as raw strings that may:
 *   • concatenate disjoint excerpts with the literal " [...] " marker
 *   • include markdown link syntax `[label](url)` left over from
 *     LinkedIn page parsing
 *   • run hundreds of characters when whole sections of a profile are
 *     surfaced wholesale
 *
 * We post-process at read-time so cleaning new + legacy rows is the
 * same code path. Keeps the "Why this match" UI a tight 1–3 sentence
 * rationale rather than a wall of text.
 */

const MAX_PIECES = 3;
const MAX_PIECE_LEN = 240;
const MIN_PIECE_LEN = 30;

export function cleanHighlights(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    for (const piece of item.split(/\s*\[\.\.\.\]\s*/)) {
      const cleaned = piece
        // Markdown links → keep label, drop the URL/parens noise.
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Header marker hashes Exa sometimes leaves in (`### Title`).
        .replace(/^#+\s*/g, '')
        // Collapse newlines + runs of whitespace.
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length < MIN_PIECE_LEN) continue; // titles / fragments
      if (out.includes(cleaned)) continue;          // dedupe
      const capped =
        cleaned.length > MAX_PIECE_LEN ? truncateAtBoundary(cleaned, MAX_PIECE_LEN) : cleaned;
      out.push(capped);
      if (out.length >= MAX_PIECES) return out;
    }
  }
  return out;
}

/**
 * Pull the highlights array off a contact's `profile_json`. Defensive
 * narrowing — legacy rows may have any shape, and we never want a
 * candidate detail to crash because old data lacks this field.
 */
export function extractHighlightsFromProfileJson(profileJson: unknown): string[] {
  if (!profileJson || typeof profileJson !== 'object') return [];
  return cleanHighlights((profileJson as { highlights?: unknown }).highlights);
}

/** Trim at the nearest sentence boundary, falling back to word boundary. */
function truncateAtBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const sentenceEnd = head.lastIndexOf('. ');
  if (sentenceEnd > max * 0.6) return head.slice(0, sentenceEnd + 1);
  const wordEnd = head.lastIndexOf(' ');
  if (wordEnd > max * 0.6) return `${head.slice(0, wordEnd)}…`;
  return `${head}…`;
}
