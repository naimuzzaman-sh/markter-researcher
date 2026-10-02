import type { ReactNode } from 'react';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

// Wire shape from `get_contact`: `contactId` field, not bare `id`.
type ContactResult = {
  contactId: string;
  name: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  location: string | null;
  linkedinUrl: string | null;
  researchNotes: string | null;
  createdAt: string | Date;
  // profileJson is intentionally NOT in the type — internal scrape only.
};

export function ContactDetail({ result, onAction }: CardRendererProps) {
  const c = result as ContactResult;
  const name = c.name;
  const roleLine =
    c.title && c.companyName
      ? `${c.title} at ${c.companyName}`
      : c.title ?? c.companyName ?? '';
  const subtitleParts = [roleLine, c.location].filter(Boolean);

  return (
    <Panel
      kicker="CONTACT"
      title={name}
      subtitle={subtitleParts.join(' · ')}
      actions={
        <>
          <ActionPill
            variant="solid"
            action={{ kind: 'prompt', text: `Use ${name} in a new brief` }}
            onAction={onAction}
          >
            Use in new brief
          </ActionPill>
          {c.linkedinUrl && (
            <ActionPill
              action={{ kind: 'href', url: c.linkedinUrl }}
              onAction={onAction}
            >
              Open LinkedIn ↗
            </ActionPill>
          )}
          {c.email && (
            <ActionPill
              action={{ kind: 'mailto', address: c.email }}
              onAction={onAction}
            >
              Email
            </ActionPill>
          )}
        </>
      }
    >
      <FieldGrid
        items={[
          ['EMAIL', c.email ?? '—'],
          ['LINKEDIN', c.linkedinUrl ? linkedinSlug(c.linkedinUrl) : '—'],
          ['COMPANY DOMAIN', c.companyDomain ?? '—'],
          ['ADDED', formatRelativeTime(c.createdAt)],
        ]}
      />
      {c.researchNotes && <Field label="RESEARCH NOTES">{c.researchNotes}</Field>}
    </Panel>
  );
}

function linkedinSlug(url: string): string {
  const match = url.match(/in\/([^/?]+)/);
  return match ? `/in/${match[1]}` : url;
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
