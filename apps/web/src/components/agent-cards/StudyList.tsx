import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type StudyListItem = {
  studyId: string;
  productName: string;
  companyName: string;
  industry: string;
  objective: string;
  questionCount: number;
  status: 'draft' | 'active';
  createdAt: string;
};

export function StudyList({ result, onAction }: CardRendererProps) {
  const items = result as StudyListItem[];
  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="Start your first study"
        subtitle="I'll walk you through company → product → questions in a few turns."
        actions={
          <ActionPill
            variant="solid"
            action={{ kind: 'prompt', text: 'Create a new study' }}
            onAction={onAction}
          >
            Create study →
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
        const productName = b.productName || 'Untitled study';
        const isDraft = b.status === 'draft';
        // Click → fetch the study detail (same get_study tool as a
        // direct "show me study X" prompt). The detail card renders
        // inline in chat with action pills (Edit, Find candidates, …).
        // We deliberately don't navigate / change route — keeping the
        // chat thread continuous matters more than URL-anchoring.
        return (
          <Panel
            key={b.studyId}
            role="button"
            onClick={() =>
              onAction({
                kind: 'tool',
                toolName: 'get_study',
                toolArgs: { studyId: b.studyId },
                displayText: `Show me study: ${productName}`,
              })
            }
            kicker={
              isDraft
                ? `STUDY · ${String(i + 1).padStart(2, '0')} · DRAFT`
                : `STUDY · ${String(i + 1).padStart(2, '0')}`
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
