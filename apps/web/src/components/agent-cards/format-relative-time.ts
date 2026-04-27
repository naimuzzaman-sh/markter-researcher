const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * Convert a date (or ISO string, or null) to a short user-facing relative
 * timestamp like "5 minutes ago" or "2 days ago". Empty string for null.
 */
export function formatRelativeTime(input: Date | string | null | undefined): string {
  if (!input) return '';
  const then = typeof input === 'string' ? new Date(input).getTime() : input.getTime();
  const diff = Date.now() - then;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const n = Math.floor(diff / MINUTE);
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const n = Math.floor(diff / HOUR);
    return `${n} hour${n === 1 ? '' : 's'} ago`;
  }
  if (diff < WEEK) {
    const n = Math.floor(diff / DAY);
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  if (diff < MONTH) {
    const n = Math.floor(diff / WEEK);
    return `${n} week${n === 1 ? '' : 's'} ago`;
  }
  const n = Math.floor(diff / MONTH);
  return `${n} month${n === 1 ? '' : 's'} ago`;
}
