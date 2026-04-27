import type { PillAction } from '@/lib/api';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import type { CardRendererProps } from './types';

type CandidateStatus =
  | 'discovered'
  | 'pending_review'
  | 'approved'
  | 'contacted'
  | 'scheduled'
  | 'interviewed'
  | 'rejected';

type CandidateMutationResult = {
  candidateId: string;
  briefId: string;
  briefName?: string | null;
  status: CandidateStatus;
  contact: { name: string };
};

const VERB: Record<CandidateStatus, string> = {
  discovered: 'UPDATED',
  pending_review: 'UPDATED',
  approved: 'APPROVED',
  contacted: 'MARKED CONTACTED',
  scheduled: 'MARKED SCHEDULED',
  interviewed: 'MARKED INTERVIEWED',
  rejected: 'REJECTED',
};

export function MutationConfirm({ result, onAction }: CardRendererProps) {
  const c = result as CandidateMutationResult;
  const name = c.contact?.name ?? 'Candidate';
  const briefHint = c.briefName ?? 'this brief';
  return (
    <Panel
      variant="tight"
      kicker={`✓ ${VERB[c.status]}`}
      title={name}
      subtitle={`on ${briefHint} · just now`}
      actions={renderNextStep(c, onAction)}
    >
      {null}
    </Panel>
  );
}

function renderNextStep(
  c: CandidateMutationResult,
  onAction: (action: PillAction) => void,
) {
  const name = c.contact?.name ?? 'Candidate';
  const candidateId = c.candidateId;

  const view = (
    <ActionPill
      action={{
        kind: 'tool',
        toolName: 'get_candidate',
        toolArgs: { candidateId },
        displayText: `Show me candidate: ${name}`,
      }}
      onAction={onAction}
    >
      View candidate
    </ActionPill>
  );
  switch (c.status) {
    case 'approved':
      return (
        <>
          <ActionPill
            variant="solid"
            action={{ kind: 'prompt', text: `Mark ${name} as contacted` }}
            onAction={onAction}
          >
            Mark contacted
          </ActionPill>
          {view}
        </>
      );
    case 'rejected':
      return (
        <>
          <ActionPill
            action={{
              kind: 'tool',
              toolName: 'approve_candidate',
              toolArgs: { candidateId },
              displayText: `Re-approve ${name}`,
            }}
            onAction={onAction}
          >
            Re-approve
          </ActionPill>
          {view}
        </>
      );
    default:
      return view;
  }
}
