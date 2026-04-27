import { Panel } from './Panel';
import { StatusPill } from './StatusPill';
import { ActionPill } from './ActionPill';
import { formatSource } from './format-source';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type CandidateListItem = {
  candidateId: string;
  briefId: string;
  contactId: string;
  status:
    | 'discovered'
    | 'pending_review'
    | 'approved'
    | 'contacted'
    | 'scheduled'
    | 'interviewed'
    | 'rejected';
  source: 'discovery' | 'manual' | 'import';
  matchScore: number | null;
  interviewId: string | null;
  createdAt: string;
  contact: {
    id: string;
    name: string;
    title: string | null;
    companyName: string | null;
    linkedinUrl: string | null;
  };
};

type CandidateListResult =
  | CandidateListItem[] // legacy / MCP-side shape
  | {
      briefId: string;
      briefName: string | null;
      candidates: CandidateListItem[];
    };

function unpack(result: CandidateListResult): {
  items: CandidateListItem[];
  briefId: string | null;
  briefName: string | null;
} {
  if (Array.isArray(result)) {
    return { items: result, briefId: null, briefName: null };
  }
  return {
    items: result.candidates,
    briefId: result.briefId,
    briefName: result.briefName,
  };
}

export function CandidateList({ result, onAction }: CardRendererProps) {
  const { items, briefId, briefName } = unpack(result as CandidateListResult);

  if (items.length === 0) {
    const briefHint = briefName ?? 'this brief';
    // Use the deterministic tool action when we have the briefId in the
    // wrap; otherwise fall back to a prompt the LLM can interpret.
    const findAction =
      briefId
        ? ({
            kind: 'tool' as const,
            toolName: 'find_candidates',
            toolArgs: { briefId },
            displayText: `Find candidates for ${briefHint}`,
          })
        : ({
            kind: 'prompt' as const,
            text: `Find candidates for ${briefHint}`,
          });
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="No candidates yet"
        subtitle={`Run a discovery search to find people for ${briefHint}.`}
        actions={
          <ActionPill variant="solid" action={findAction} onAction={onAction}>
            Find candidates →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((c, i) => {
        const name = c.contact.name;
        const subtitle =
          c.contact.title && c.contact.companyName
            ? `${c.contact.title} at ${c.contact.companyName}`
            : c.contact.title ?? c.contact.companyName ?? '';
        const matchPct = c.matchScore != null ? `${Math.round(c.matchScore * 100)}%` : '';
        return (
          <Panel
            key={c.candidateId}
            role="button"
            onClick={() =>
              onAction({
                kind: 'tool',
                toolName: 'get_candidate',
                toolArgs: { candidateId: c.candidateId },
                displayText: `Show me candidate: ${name}`,
              })
            }
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>CANDIDATE · {String(i + 1).padStart(2, '0')}</span>
                <StatusPill kind="candidate" value={c.status} />
              </span>
            }
            title={name}
            subtitle={subtitle}
            variant="tight"
          >
            <div className="mt-3 pt-2 border-t border-border/40 flex justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <span>{formatSource(c, c.contact)}</span>
              <span>
                {matchPct && `match ${matchPct}`}
                {matchPct && ' · '}
                {formatRelativeTime(c.createdAt)}
              </span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
