import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { SentimentPill } from './SentimentPill';
import { formatRelativeTime } from './format-relative-time';
import { formatDuration } from './format-duration';
import type { CardRendererProps } from './types';

type InterviewListItem = {
  interviewId: string;
  briefId: string | null;
  briefName: string | null;
  contactName: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  overallSentiment: 'positive' | 'neutral' | 'negative' | null;
  completedAt: string | null;
};

type InterviewListResult =
  | InterviewListItem[]
  | {
      briefId: string | null;
      briefName: string | null;
      interviews: InterviewListItem[];
    };

function unpack(result: InterviewListResult): {
  items: InterviewListItem[];
  briefId: string | null;
  briefName: string | null;
} {
  if (Array.isArray(result)) return { items: result, briefId: null, briefName: null };
  return {
    items: result.interviews,
    briefId: result.briefId,
    briefName: result.briefName,
  };
}

export function InterviewList({ result, onAction }: CardRendererProps) {
  const { items, briefId, briefName } = unpack(result as InterviewListResult);

  if (items.length === 0) {
    const briefHint = briefName ?? null;
    // When scoped to a brief, we have its id and can route deterministically;
    // unscoped empty falls back to listing briefs (also a tool action).
    const emptyAction =
      briefHint && briefId
        ? ({
            kind: 'tool' as const,
            toolName: 'list_candidates_for_brief',
            toolArgs: { briefId },
            displayText: `List candidates for ${briefHint}`,
          })
        : ({
            kind: 'tool' as const,
            toolName: 'list_briefs',
            toolArgs: {},
            displayText: 'List my briefs',
          });
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title={briefHint ? `No interviews for ${briefHint} yet` : 'No interviews yet'}
        subtitle={
          briefHint
            ? `Approve candidates for ${briefHint} and run interviews to populate this list.`
            : 'Approve candidates and run interviews to populate this list.'
        }
        actions={
          <ActionPill variant="solid" action={emptyAction} onAction={onAction}>
            {briefHint ? 'View candidates →' : 'Open a brief →'}
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((iv, i) => {
        const contactHint = iv.contactName ?? `Interview ${i + 1}`;
        const briefHint = iv.briefName ?? 'a brief';
        const duration = formatDuration(iv.durationSecs);
        return (
          <Panel
            key={iv.interviewId}
            role="button"
            onClick={() =>
              onAction({
                kind: 'tool',
                toolName: 'get_interview',
                toolArgs: { interviewId: iv.interviewId },
                displayText: `Show me interview: ${contactHint} on ${briefHint}`,
              })
            }
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>INTERVIEW · {String(i + 1).padStart(2, '0')}</span>
                {iv.overallSentiment && <SentimentPill value={iv.overallSentiment} />}
              </span>
            }
            title={duration ? `${contactHint} · ${duration}` : contactHint}
            subtitle={`on ${briefHint}`}
            variant="tight"
          >
            <div className="mt-2 pt-2 border-t border-border/40 flex justify-between items-center font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <StatusPill kind="interview" value={iv.status} />
              <span>{formatRelativeTime(iv.completedAt)}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
