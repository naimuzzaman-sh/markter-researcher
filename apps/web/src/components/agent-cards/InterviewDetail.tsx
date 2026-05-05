import type { ReactNode } from 'react';
import type { CallAnalysis } from '@mirrars/shared';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { SentimentPill } from './SentimentPill';
import { formatDuration } from './format-duration';
import type { CardRendererProps } from './types';

type InterviewDetailResult = {
  interviewId: string;
  studyId: string | null;
  studyName: string | null;
  contactName: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  completedAt: string | null;
  transcript: Array<{ role: 'user' | 'agent'; message: string; timeInCallSecs: number }>;
  analysis: CallAnalysis | null;
};

export function InterviewDetail({ result, onAction }: CardRendererProps) {
  const iv = result as InterviewDetailResult;
  const duration = formatDuration(iv.durationSecs);
  const turnCount = iv.transcript?.length ?? 0;
  const studyHint = iv.studyName ?? 'a study';
  const contactHint = iv.contactName ?? 'this interview';

  return (
    <Panel
      kicker={`INTERVIEW · ON ${studyHint.toUpperCase()}`}
      title={`${contactHint}${duration ? ` · ${duration}` : ''}`}
      subtitle={`${iv.status === 'completed' ? 'completed' : 'failed'}${
        turnCount ? ` · ${turnCount} turns` : ''
      }`}
      actions={
        <>
          {iv.studyName && iv.studyId && (
            <ActionPill
              variant="solid"
              action={{
                kind: 'tool',
                toolName: 'get_study',
                toolArgs: { studyId: iv.studyId },
                displayText: `Show me study: ${iv.studyName}`,
              }}
              onAction={onAction}
            >
              View study
            </ActionPill>
          )}
          {iv.contactName && (
            <ActionPill
              action={{
                kind: 'prompt',
                text: `Show me contact: ${iv.contactName}`,
              }}
              onAction={onAction}
            >
              View contact
            </ActionPill>
          )}
        </>
      }
    >
      <FieldGrid
        items={[
          [
            'SENTIMENT',
            iv.analysis ? <SentimentPill value={iv.analysis.overallSentiment} /> : '—',
          ],
          ['STATUS', <StatusPill kind="interview" value={iv.status} />],
          ['DURATION', duration || '—'],
          ['PARTICIPANT ROLE', iv.analysis?.participant.inferredRole ?? '—'],
        ]}
      />
      {iv.analysis && (
        <>
          {iv.analysis.participant.background && (
            <Field label="PARTICIPANT BACKGROUND">{iv.analysis.participant.background}</Field>
          )}
          {iv.analysis.keyInsights.length > 0 && (
            <BulletField
              label={`KEY INSIGHTS · ${iv.analysis.keyInsights.length}`}
              items={iv.analysis.keyInsights}
            />
          )}
          {iv.analysis.productMarketFitSignals.length > 0 && (
            <BulletField
              label={`PMF SIGNALS · ${iv.analysis.productMarketFitSignals.length}`}
              items={iv.analysis.productMarketFitSignals}
            />
          )}
          {iv.analysis.answers.length > 0 && (
            <div className="mt-4">
              <FieldLabel>ANSWERS · {iv.analysis.answers.length}</FieldLabel>
              <ol className="mt-2 space-y-3">
                {iv.analysis.answers.map((a, i) => (
                  <li key={a.questionId ?? i} className="flex gap-3">
                    <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground">
                        {a.sentiment}
                      </div>
                      <p className="font-serif text-base leading-relaxed">{a.response}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {iv.analysis.suggestedFollowUps.length > 0 && (
            <BulletField
              label={`SUGGESTED FOLLOW-UPS · ${iv.analysis.suggestedFollowUps.length}`}
              items={iv.analysis.suggestedFollowUps}
            />
          )}
        </>
      )}
      {turnCount > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
            Open transcript · {turnCount} turns
          </summary>
          <div className="mt-2 space-y-2">
            {iv.transcript.map((t, i) => (
              <div key={i} className="border-b border-border/40 pb-2">
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-0.5">
                  {t.role === 'agent' ? 'Researcher' : 'You'} · {formatDuration(t.timeInCallSecs)}
                </div>
                <p className="font-serif text-sm leading-relaxed">{t.message}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </Panel>
  );
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

function BulletField({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <ul className="mt-2 list-disc pl-6 space-y-1 font-serif text-base leading-relaxed">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
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
