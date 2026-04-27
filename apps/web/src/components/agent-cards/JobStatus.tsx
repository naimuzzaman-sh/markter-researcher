import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type JobKind = 'discovery' | 'research' | 'outreach';

type JobResult = {
  jobId: string;
  kind?: JobKind;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt?: string | null;
  finishedAt?: string | null;
  input?: { briefId?: string } | null;
  briefId?: string | null;
  briefName?: string | null;
  error?: string | null;
  next?: string;
};

const KIND_LABELS: Record<
  JobKind,
  { running: string; succeeded: string; queued: string }
> = {
  discovery: {
    running: 'Sourcing candidates…',
    succeeded: 'Sourcing complete.',
    queued: 'Sourcing is queued.',
  },
  research: {
    running: 'Researching…',
    succeeded: 'Research complete.',
    queued: 'Research is queued.',
  },
  outreach: {
    running: 'Outreach in progress…',
    succeeded: 'Outreach complete.',
    queued: 'Outreach is queued.',
  },
};

export function JobStatus({ result, onAction }: CardRendererProps) {
  const job = result as JobResult;
  const kind: JobKind = job.kind ?? 'discovery';
  const kicker = `JOB · ${kind.toUpperCase()}`;
  const elapsed = job.startedAt ? formatRelativeTime(job.startedAt) : 'just now';
  const briefId = job.briefId ?? job.input?.briefId ?? null;
  const briefName = job.briefName ?? null;
  const briefSuffix = briefName ? ` for ${briefName}` : '';
  const jobId = job.jobId;

  if (job.status === 'failed') {
    return (
      <Panel
        variant="error"
        kicker={`⚠ ERROR · ${kicker}`}
        title="Job failed"
        subtitle={`failed · started ${elapsed}`}
        actions={
          <ActionPill
            action={{
              kind: 'prompt',
              text: briefName
                ? `Retry candidate sourcing for ${briefName}`
                : 'Retry that operation',
            }}
            onAction={onAction}
          >
            Try again
          </ActionPill>
        }
      >
        {job.error && (
          <p className="font-serif text-base leading-relaxed">{job.error.slice(0, 280)}</p>
        )}
      </Panel>
    );
  }

  if (job.status === 'succeeded') {
    // Direct tool action when we know the briefId; fall back to a prompt
    // so the LLM can find the most-recent brief if scope is missing.
    const openResultsAction = briefId
      ? ({
          kind: 'tool' as const,
          toolName: 'list_candidates_for_brief',
          toolArgs: { briefId },
          displayText: briefName
            ? `List candidates for ${briefName}`
            : 'List candidates for the latest brief',
        })
      : ({
          kind: 'prompt' as const,
          text: 'List candidates for the latest brief',
        });
    return (
      <Panel
        variant="tight"
        kicker={kicker}
        title={KIND_LABELS[kind].succeeded}
        subtitle={`succeeded${briefSuffix} · started ${elapsed}`}
        actions={
          <ActionPill variant="solid" action={openResultsAction} onAction={onAction}>
            Open results →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  // queued OR running
  const isRunning = job.status === 'running';
  return (
    <Panel
      variant="tight"
      kicker={kicker}
      title={KIND_LABELS[kind][isRunning ? 'running' : 'queued']}
      subtitle={
        isRunning
          ? `running${briefSuffix} · started ${elapsed}`
          : `queued${briefSuffix} · ${elapsed}`
      }
      actions={
        <ActionPill
          action={{
            kind: 'tool',
            toolName: 'get_job_status',
            toolArgs: { jobId },
            displayText: briefName
              ? `Check the status of the candidate sourcing job for ${briefName}`
              : 'Check the status of the candidate sourcing job',
          }}
          onAction={onAction}
        >
          Check status
        </ActionPill>
      }
    >
      {isRunning && (
        <p className="font-serif text-sm text-muted-foreground italic">
          This usually takes a minute or two.
        </p>
      )}
    </Panel>
  );
}
