import type { Artifact } from './artifact';

/**
 * Deterministic short framing string for an artifact, used by the
 * `/run-tool` endpoint when a pill click bypasses the LLM. Templated and
 * cheap; the card itself carries the data, so prose only frames it.
 *
 * Each branch reads the artifact data defensively — fields may be
 * missing if upstream tools change shape; we fall back to a neutral
 * sentence rather than crashing.
 */
export function replyForArtifact(artifact: Artifact): string {
  const data = (artifact.data ?? {}) as Record<string, unknown>;

  switch (artifact.type) {
    case 'study.list': {
      const items = Array.isArray(artifact.data) ? artifact.data.length : 0;
      if (items === 0) return "You don't have any studies yet.";
      return items === 1 ? '1 study.' : `${items} studies.`;
    }
    case 'study.detail': {
      const ctx = (data.researchContext ?? {}) as Record<string, unknown>;
      const product = (ctx.product ?? {}) as Record<string, unknown>;
      const name = pickString(product.name);
      return name ? `Here's the ${name} study.` : "Here's the study.";
    }
    case 'candidate.list': {
      const candidates = Array.isArray(data.candidates)
        ? (data.candidates as unknown[]).length
        : Array.isArray(artifact.data)
          ? artifact.data.length
          : 0;
      const studyName = pickString(data.studyName);
      const suffix = studyName ? ` for ${studyName}` : '';
      if (candidates === 0) return `No candidates${suffix} yet.`;
      const word = candidates === 1 ? 'candidate' : 'candidates';
      return `${candidates} ${word}${suffix}.`;
    }
    case 'candidate.detail': {
      const contact = (data.contact ?? {}) as Record<string, unknown>;
      const name = pickString(contact.name);
      return name ? `Here's ${name}'s profile.` : "Here's the candidate's profile.";
    }
    case 'candidate.mutation': {
      const contact = (data.contact ?? {}) as Record<string, unknown>;
      const name = pickString(contact.name) ?? 'Candidate';
      const status = pickString(data.status);
      switch (status) {
        case 'approved':
          return `Approved ${name}.`;
        case 'rejected':
          return `Rejected ${name}.`;
        case 'contacted':
          return `Marked ${name} as contacted.`;
        case 'scheduled':
          return `Marked ${name} as scheduled.`;
        case 'interviewed':
          return `Marked ${name} as interviewed.`;
        default:
          return `Updated ${name}.`;
      }
    }
    case 'contact.list': {
      const items = Array.isArray(artifact.data) ? artifact.data.length : 0;
      if (items === 0) return "You don't have any contacts yet.";
      return items === 1 ? '1 contact.' : `${items} contacts.`;
    }
    case 'contact.detail': {
      const name = pickString(data.name);
      return name ? `Here's ${name}'s contact.` : "Here's the contact.";
    }
    case 'interview.list': {
      const interviews = Array.isArray(data.interviews)
        ? (data.interviews as unknown[]).length
        : Array.isArray(artifact.data)
          ? artifact.data.length
          : 0;
      const studyName = pickString(data.studyName);
      const suffix = studyName ? ` for ${studyName}` : '';
      if (interviews === 0) return `No interviews${suffix} yet.`;
      const word = interviews === 1 ? 'interview' : 'interviews';
      return `${interviews} ${word}${suffix}.`;
    }
    case 'interview.detail': {
      const name = pickString(data.contactName);
      return name ? `Here's ${name}'s interview.` : "Here's the interview.";
    }
    case 'job.status': {
      const status = pickString(data.status);
      const studyName = pickString(data.studyName);
      const suffix = studyName ? ` for ${studyName}` : '';
      switch (status) {
        case 'queued':
          return `Sourcing queued${suffix}.`;
        case 'running':
          return `Sourcing in progress${suffix}.`;
        case 'succeeded': {
          // Surface the actual breakdown when the discovery output is
          // present — "Sourcing complete" alone hides the case where
          // every result was a duplicate (re-running the same query
          // returns the same profiles, all already linked to this
          // study).
          const out = (data.output ?? {}) as Record<string, unknown>;
          const added = typeof out.candidateCount === 'number' ? out.candidateCount : null;
          const skipped = typeof out.skipped === 'number' ? out.skipped : 0;
          if (added === null) return `Sourcing complete${suffix}.`;
          if (added === 0 && skipped > 0) {
            return (
              `Sourcing complete${suffix} — 0 new candidates. ` +
              `All ${skipped} result${skipped === 1 ? '' : 's'} were already in this study. ` +
              `Try refining the audience or adding extraCriteria to surface new people.`
            );
          }
          if (added === 0) return `Sourcing complete${suffix} — no candidates matched.`;
          const word = added === 1 ? 'candidate' : 'candidates';
          const dupe =
            skipped > 0
              ? ` (${skipped} already in this study, skipped)`
              : '';
          return `Sourcing complete${suffix} — ${added} new ${word}${dupe}.`;
        }
        case 'failed':
          return `Sourcing failed${suffix}.`;
        default:
          return `Job updated${suffix}.`;
      }
    }
    case 'dashboard': {
      if (data.empty) return "Welcome — let's start with your first study.";
      const counts = (data.counts ?? {}) as Record<string, unknown>;
      const studies = typeof counts.studies === 'number' ? counts.studies : 0;
      const pendingByStudy = Array.isArray(data.pendingByStudy)
        ? (data.pendingByStudy as Array<{ count?: unknown }>)
        : [];
      const pending = pendingByStudy.reduce(
        (sum, p) => sum + (typeof p.count === 'number' ? p.count : 0),
        0,
      );
      if (pending > 0) {
        const word = pending === 1 ? 'candidate' : 'candidates';
        return `Welcome back. ${pending} ${word} waiting on your review.`;
      }
      const studyWord = studies === 1 ? 'study' : 'studies';
      return `Welcome back. ${studies} ${studyWord} in your workspace — all caught up.`;
    }
    default: {
      const _exhaustive: never = artifact.type;
      void _exhaustive;
      return '';
    }
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
