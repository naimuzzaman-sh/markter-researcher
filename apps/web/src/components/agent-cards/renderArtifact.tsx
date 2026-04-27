import type { ReactNode } from 'react';
import type { Artifact, PillAction } from '@/lib/api';
import { BriefList } from './BriefList';
import { BriefDetail } from './BriefDetail';
import { CandidateList } from './CandidateList';
import { CandidateDetail } from './CandidateDetail';
import { ContactList } from './ContactList';
import { ContactDetail } from './ContactDetail';
import { InterviewList } from './InterviewList';
import { InterviewDetail } from './InterviewDetail';
import { JobStatus } from './JobStatus';
import { MutationConfirm } from './MutationConfirm';

/**
 * Render the single artifact selected by the server for this assistant
 * turn. There is no registry, no filter, no per-tool heuristic — the
 * server already decided what (if anything) the user should see, and
 * stamped it as `artifact.type`.
 */
export function renderArtifact(
  artifact: Artifact | null,
  onAction: (action: PillAction) => void,
): ReactNode {
  if (!artifact) return null;

  const props = { result: artifact.data, error: null, onAction };

  switch (artifact.type) {
    case 'brief.list':
      return <BriefList {...props} />;
    case 'brief.detail':
      return <BriefDetail {...props} />;
    case 'candidate.list':
      return <CandidateList {...props} />;
    case 'candidate.detail':
      return <CandidateDetail {...props} />;
    case 'candidate.mutation':
      return <MutationConfirm {...props} />;
    case 'contact.list':
      return <ContactList {...props} />;
    case 'contact.detail':
      return <ContactDetail {...props} />;
    case 'interview.list':
      return <InterviewList {...props} />;
    case 'interview.detail':
      return <InterviewDetail {...props} />;
    case 'job.status':
      return <JobStatus {...props} />;
    default: {
      // Exhaustiveness: when a new ArtifactType lands and a renderer is
      // missed, TypeScript flags it here.
      const _exhaustive: never = artifact.type;
      void _exhaustive;
      return null;
    }
  }
}
