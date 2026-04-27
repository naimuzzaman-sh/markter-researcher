import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

// Wire shape from `list_contacts`: `contactId`, not bare `id`.
type ContactListItem = {
  contactId: string;
  name: string;
  title: string | null;
  companyName: string | null;
  email: string | null;
  location: string | null;
  linkedinUrl: string | null;
  createdAt: string;
};

export function ContactList({ result, onAction }: CardRendererProps) {
  const items = result as ContactListItem[];

  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="No contacts yet"
        subtitle="Run discovery on a brief to populate your contact list."
        actions={
          <ActionPill
            variant="solid"
            action={{
              kind: 'tool',
              toolName: 'list_briefs',
              toolArgs: {},
              displayText: 'List my briefs',
            }}
            onAction={onAction}
          >
            Open a brief →
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
        const name = c.name;
        const roleLine =
          c.title && c.companyName
            ? `${c.title} at ${c.companyName}`
            : c.title ?? c.companyName ?? '';
        const subtitleParts = [roleLine, c.location].filter(Boolean);
        return (
          <Panel
            key={c.contactId}
            role="button"
            onClick={() =>
              onAction({
                kind: 'tool',
                toolName: 'get_contact',
                toolArgs: { contactId: c.contactId },
                displayText: `Show me contact: ${name}`,
              })
            }
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>CONTACT · {String(i + 1).padStart(2, '0')}</span>
                {c.linkedinUrl && (
                  <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    LINKEDIN
                  </span>
                )}
              </span>
            }
            title={name}
            subtitle={subtitleParts.join(' · ')}
            variant="tight"
          >
            <div className="mt-3 pt-2 border-t border-border/40 flex justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <span>{c.email ?? ''}</span>
              <span>added {formatRelativeTime(c.createdAt)}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
