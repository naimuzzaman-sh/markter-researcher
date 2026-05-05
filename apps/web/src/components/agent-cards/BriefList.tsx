import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type BriefListItem = {
  briefId: string;
  productName: string;
  companyName: string;
  industry: string;
  objective: string;
  questionCount: number;
  status: 'draft' | 'active';
  createdAt: string;
};

export function BriefList({ result, onAction }: CardRendererProps) {
  const items = result as BriefListItem[];
  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="Start your first brief"
        subtitle="I'll walk you through company → product → questions in a few turns."
        actions={
          <ActionPill
            variant="solid"
            action={{ kind: 'prompt', text: 'Create a new brief' }}
            onAction={onAction}
          >
            Create brief →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((b, i) => {
        const subtitleParts = [b.companyName, b.industry].filter(Boolean);
        const productName = b.productName || 'Untitled brief';
        const isDraft = b.status === 'draft';
        // Click → fetch the brief detail (same get_brief tool as a
        // direct "show me brief X" prompt). The detail card renders
        // inline in chat with action pills (Edit, Find candidates, …).
        // We deliberately don't navigate / change route — keeping the
        // chat thread continuous matters more than URL-anchoring.
        return (
          <Panel
            key={b.briefId}
            role="button"
            onClick={() =>
              onAction({
                kind: 'tool',
                toolName: 'get_brief',
                toolArgs: { briefId: b.briefId },
                displayText: `Show me brief: ${productName}`,
              })
            }
            kicker={
              isDraft
                ? `BRIEF · ${String(i + 1).padStart(2, '0')} · DRAFT`
                : `BRIEF · ${String(i + 1).padStart(2, '0')}`
            }
            title={productName}
            subtitle={subtitleParts.join(' · ')}
            variant="tight"
          >
            {b.objective && (
              <p className="font-serif text-sm text-muted-foreground line-clamp-2">
                {b.objective}
              </p>
            )}
            <div className="mt-3 pt-2 border-t border-border/40 flex justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <span>
                {isDraft
                  ? 'in progress'
                  : `${b.questionCount} ${b.questionCount === 1 ? 'question' : 'questions'}`}
              </span>
              <span>{formatRelativeTime(b.createdAt)}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
