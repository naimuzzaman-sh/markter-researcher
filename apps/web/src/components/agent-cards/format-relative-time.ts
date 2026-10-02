import { formatDistanceToNowStrict } from 'date-fns';

/**
 * Convert a date (or ISO string, or null) to a short user-facing relative
 * timestamp like "5 minutes ago" or "2 days ago". Empty string for null
 * so callers can render unconditionally without a guard.
 *
 * Thin wrapper over date-fns; centralized so we can swap the underlying
 * implementation or add locale support in one place.
 */
export function formatRelativeTime(input: Date | string | null | undefined): string {
  if (!input) return '';
  const date = typeof input === 'string' ? new Date(input) : input;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
