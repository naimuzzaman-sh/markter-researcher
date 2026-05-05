import type { ReactNode } from 'react';
import type { PillAction } from '@/lib/api';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { formatSource } from './format-source';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type CandidateStatus =
  | 'discovered'
  | 'pending_review'
  | 'approved'
  | 'contacted'
  | 'scheduled'
  | 'interviewed'
  | 'rejected';

type CandidateDetailResult = {
  candidateId: string;
  studyId: string;
  studyName?: string | null;
  contactId: string;
  status: CandidateStatus;
  source: 'discovery' | 'manual' | 'import';
  matchScore: number | null;
  interviewId: string | null;
  createdAt: string;
  contact: {
    id: string;
    name: string;
    title: string | null;
    companyName: string | null;
    location?: string | null;
    email?: string | null;
    linkedinUrl: string | null;
    researchNotes?: string | null;
  };
  /** Per-query relevance excerpts from discovery — "why this match". */
  highlights?: string[];
};

export function CandidateDetail({ result, onAction }: CardRendererProps) {
  const c = result as CandidateDetailResult;
  const name = c.contact.name;
  const studyHint = c.studyName ?? 'this study';
  const matchPct = c.matchScore != null ? `${Math.round(c.matchScore * 100)}%` : '—';

  const subtitleParts = [
    c.contact.title && c.contact.companyName
      ? `${c.contact.title} at ${c.contact.companyName}`
      : c.contact.title ?? c.contact.companyName ?? '',
    c.contact.location,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');

  return (
    <Panel
      kicker={`CANDIDATE · FOR ${studyHint.toUpperCase()}`}
      title={name}
      subtitle={subtitle}
      actions={renderActions(c, name, onAction)}
    >
      <FieldGrid
        items={[
          ['STATUS', <StatusPill key="s" kind="candidate" value={c.status} />],
          ['MATCH SCORE', matchPct],
          ['SOURCE', formatSource(c, c.contact)],
          ['DISCOVERED', formatRelativeTime(c.createdAt)],
        ]}
      />
      {c.highlights && c.highlights.length > 0 && (
        <div className="mt-4">
          <FieldLabel>WHY THIS MATCH</FieldLabel>
          {/* Italic + accent rule on the left reads as a quoted excerpt
              without literal ASCII quotes — keeps long-ish sentences
              from looking forced. Tight `space-y-2` so multiple
              highlights stack as a list, not a wall of prose. */}
          <ul className="mt-1.5 space-y-2">
            {c.highlights.map((h, i) => (
              <li
                key={i}
                className="font-serif italic text-sm leading-relaxed text-foreground/85 pl-3 border-l-2 border-accent/40"
              >
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.contact.researchNotes && (
        <Field label="RESEARCH NOTES">{c.contact.researchNotes}</Field>
      )}
      {(c.contact.email || c.contact.linkedinUrl) && (
        <Field label="CONTACT">
          {[
            c.contact.email,
            c.contact.linkedinUrl ? linkedinSlug(c.contact.linkedinUrl) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Field>
      )}
    </Panel>
  );
}

function linkedinSlug(url: string): string {
  const match = url.match(/in\/([^/?]+)/);
  return match ? `/in/${match[1]}` : url;
}

function renderActions(
  c: CandidateDetailResult,
  name: string,
  onAction: (action: PillAction) => void,
): ReactNode {
  const studyHint = c.studyName ?? 'this study';
  const candidateId = c.candidateId;
  const studyId = c.studyId;
  const interviewId = c.interviewId;

  // "View contact" — get_contact takes the contact's id (== c.contactId).
  // "View study" — get_study takes studyId. Both deterministic.
  const always = (
    <>
      <ActionPill
        action={{
          kind: 'tool',
          toolName: 'get_contact',
          toolArgs: { contactId: c.contactId },
          displayText: `Show me contact: ${name}`,
        }}
        onAction={onAction}
      >
        View contact
      </ActionPill>
      <ActionPill
        action={{
          kind: 'tool',
          toolName: 'get_study',
          toolArgs: { studyId },
          displayText: `Show me study: ${studyHint}`,
        }}
        onAction={onAction}
      >
        View study
      </ActionPill>
    </>
  );

  // Mutations that have a real tool: approve, reject. "Mark contacted /
  // scheduled / interviewed" pills don't have a backing tool today; they
  // stay as `prompt` actions so the LLM can clarify or no-op.
  const approveAction: PillAction = {
    kind: 'tool',
    toolName: 'approve_candidate',
    toolArgs: { candidateId },
    displayText: `Approve ${name}`,
  };
  const rejectAction: PillAction = {
    kind: 'tool',
    toolName: 'reject_candidate',
    toolArgs: { candidateId },
    displayText: `Reject ${name}`,
  };

  switch (c.status) {
    case 'pending_review':
    case 'discovered':
      return (
        <>
          <ActionPill variant="solid" action={approveAction} onAction={onAction}>
            Approve
          </ActionPill>
          <ActionPill variant="danger" action={rejectAction} onAction={onAction}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'approved':
      return (
        <>
          <ActionPill
            variant="solid"
            action={{
              kind: 'tool',
              toolName: 'invite_candidate',
              toolArgs: { candidateId },
              displayText: `Send invite to ${name}`,
            }}
            onAction={onAction}
          >
            Send invite →
          </ActionPill>
          <ActionPill variant="danger" action={rejectAction} onAction={onAction}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'contacted':
    case 'scheduled':
      // No `Mark scheduled` / `Mark interviewed` pills — they were
      // prompt-only with no backing tool. The `?cid=` URL auto-flips
      // status to `interviewed` when the candidate completes their call,
      // so there's no useful manual transition between contacted →
      // scheduled → interviewed for now. Reject stays as an escape hatch.
      return (
        <>
          <ActionPill variant="danger" action={rejectAction} onAction={onAction}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'interviewed':
      return (
        <>
          {interviewId ? (
            <ActionPill
              variant="solid"
              action={{
                kind: 'tool',
                toolName: 'get_interview',
                toolArgs: { interviewId },
                displayText: `Show me ${name}'s interview`,
              }}
              onAction={onAction}
            >
              Open interview →
            </ActionPill>
          ) : null}
          {always}
        </>
      );
    case 'rejected':
      return (
        <>
          <ActionPill action={approveAction} onAction={onAction}>
            Re-approve
          </ActionPill>
          {always}
        </>
      );
    default:
      return always;
  }
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-1.5 font-serif text-base leading-relaxed">{children}</p>
    </div>
  );
}

function FieldGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map(([label, value], i) => (
        <div key={i}>
          <FieldLabel>{label}</FieldLabel>
          <div className="mt-1 text-base">{value}</div>
        </div>
      ))}
    </div>
  );
}
