import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { SentimentPill } from './SentimentPill';
import { formatRelativeTime } from './format-relative-time';
import { formatDuration } from './format-duration';
import type { CardRendererProps } from './types';

type InterviewListItem = {
  interviewId: string;
  studyId: string | null;
  studyName: string | null;
  contactName: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  overallSentiment: 'positive' | 'neutral' | 'negative' | null;
  completedAt: string | null;
};

type InterviewListResult =
  | InterviewListItem[]
  | {
      studyId: string | null;
      studyName: string | null;
      interviews: InterviewListItem[];
    };

function unpack(result: InterviewListResult): {
  items: InterviewListItem[];
  studyId: string | null;
  studyName: string | null;
} {
  if (Array.isArray(result)) return { items: result, studyId: null, studyName: null };
  return {
    items: result.interviews,
    studyId: result.studyId,
    studyName: result.studyName,
  };
}

export function InterviewList({ result, onAction }: CardRendererProps) {
  const { items, studyId, studyName } = unpack(result as InterviewListResult);

  if (items.length === 0) {
    const studyHint = studyName ?? null;
    // When scoped to a study, we have its id and can route deterministically;
    // unscoped empty falls back to listing studies (also a tool action).
    const emptyAction =
      studyHint && studyId
        ? ({
            kind: 'tool' as const,
            toolName: 'list_candidates_for_study',
            toolArgs: { studyId },
            displayText: `List candidates for ${studyHint}`,
          })
        : ({
            kind: 'tool' as const,
            toolName: 'list_studies',
            toolArgs: {},
            displayText: 'List my studies',
          });
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title={studyHint ? `No interviews for ${studyHint} yet` : 'No interviews yet'}
        subtitle={
          studyHint
            ? `Approve candidates for ${studyHint} and run interviews to populate this list.`
            : 'Approve candidates and run interviews to populate this list.'
        }
        actions={
          <ActionPill variant="solid" action={emptyAction} onAction={onAction}>
            {studyHint ? 'View candidates →' : 'Open a study →'}
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
        const studyHint = iv.studyName ?? 'a study';
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
                displayText: `Show me interview: ${contactHint} on ${studyHint}`,
              })
            }
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>INTERVIEW · {String(i + 1).padStart(2, '0')}</span>
                {iv.overallSentiment && <SentimentPill value={iv.overallSentiment} />}
              </span>
            }
            title={duration ? `${contactHint} · ${duration}` : contactHint}
            subtitle={`on ${studyHint}`}
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
