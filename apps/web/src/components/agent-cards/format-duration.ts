import { intervalToDuration } from 'date-fns';

/**
 * Compact human-readable duration. Returns "" for null so callers can
 * render unconditionally. Uses date-fns to compute the breakdown but
 * formats compactly ("12m 34s" / "1h 05m") rather than verbose.
 */
export function formatDuration(secs: number | null): string {
  if (secs == null) return '';
  const d = intervalToDuration({ start: 0, end: secs * 1000 });
  const h = d.hours ?? 0;
  const m = d.minutes ?? 0;
  const s = d.seconds ?? 0;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
