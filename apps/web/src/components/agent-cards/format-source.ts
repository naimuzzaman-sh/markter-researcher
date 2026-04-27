import type { BriefCandidate, ContactSummary } from '@mirrars/shared';

/**
 * Map the candidate's internal `source` enum to a user-facing label.
 * Vendor names (Exa, etc.) never appear — internal pipeline detail stays
 * server-side. `discovery` resolves to "from LinkedIn" when the contact has
 * a LinkedIn URL, "from web search" otherwise.
 */
export function formatSource(
  candidate: Pick<BriefCandidate, 'source'>,
  contact: Pick<ContactSummary, 'linkedinUrl'>,
): string {
  if (candidate.source === 'manual') return 'added manually';
  if (candidate.source === 'import') return 'imported';
  return contact.linkedinUrl ? 'from LinkedIn' : 'from web search';
}
