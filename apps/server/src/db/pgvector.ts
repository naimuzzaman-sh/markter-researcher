/**
 * pgvector <-> JS number[] converters.
 *
 * Supabase's PostgREST does NOT auto-serialize a JS array into pgvector's
 * expected literal form; sending the raw array triggers
 * "invalid input syntax for type vector" on insert. We convert to/from the
 * string literal `"[0.1,0.2,...]"` at the DB boundary.
 */

export function formatVectorForInsert(embedding: number[] | null): string | null {
  if (embedding === null) return null;
  return `[${embedding.join(',')}]`;
}

export function parseVectorFromRow(
  raw: string | number[] | null | undefined,
): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}
