import type { ReactNode } from "react";
import { ActionPill } from "./ActionPill";
import { formatDuration } from "./format-duration";
import { formatRelativeTime } from "./format-relative-time";
import { Panel } from "./Panel";
import type { CardRendererProps } from "./types";

type DashboardData = {
  empty: boolean;
  counts: { studies: number; candidates: number; interviews: number };
  pendingByStudy: Array<{ studyId: string; studyName: string; count: number }>;
  recentStudies: Array<{
    studyId: string;
    productName: string;
    companyName: string;
    status: "draft" | "active";
    createdAt: string;
  }>;
  recentInterviews: Array<{
    interviewId: string;
    studyId: string | null;
    studyName: string | null;
    contactName: string | null;
    status: "completed" | "failed";
    durationSecs: number | null;
    completedAt: string | null;
  }>;
};

/**
 * First-turn orientation card. Two flavours:
 *   - empty (no studies yet)  → onboarding panel + single CTA
 *   - populated               → counts in the kicker · pending queue ·
 *                               recent studies · recent interviews
 *
 * Title is intentionally absent — the assistant's prose ("Welcome back…")
 * frames the turn; duplicating it on the card was redundant. Counts ride
 * on the kicker right-hand side so the eye gets state-at-a-glance without
 * a hero block.
 */
export function Dashboard({ result, onAction }: CardRendererProps) {
  const data = result as DashboardData;

  if (data.empty) {
    return (
      <Panel
        variant="tight"
        kicker="WELCOME"
        title="Welcome to Mirars"
        subtitle="Research interviews on autopilot."
        actions={
          <ActionPill
            variant="solid"
            action={{ kind: "prompt", text: "Create a new study" }}
            onAction={onAction}
          >
            Create your first study →
          </ActionPill>
        }
      >
        <p className="font-serif text-base leading-relaxed text-muted-foreground max-w-xl">
          Create a study, find candidates, send invites, then review their
          transcripts — all from this conversation.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      // Kicker = label, subtitle = counts. Putting counts in the kicker
      // alone made them feel orphaned (a mono uppercase label with
      // sentence content) — kicker now frames the panel ("WORKSPACE")
      // and counts ride in the softer serif subtitle slot.
      kicker="WORKSPACE"
      subtitle={countsLine(data.counts)}
      actions={
        <>
          <ActionPill
            variant="solid"
            action={{ kind: "prompt", text: "Create a new study" }}
            onAction={onAction}
          >
            Create study →
          </ActionPill>
          <ActionPill
            action={{
              kind: "tool",
              toolName: "list_studies",
              toolArgs: {},
              displayText: "List my studies",
            }}
            onAction={onAction}
          >
            All studies
          </ActionPill>
          <ActionPill
            action={{
              kind: "tool",
              toolName: "list_interviews",
              toolArgs: {},
              displayText: "List my interviews",
            }}
            onAction={onAction}
          >
            All interviews
          </ActionPill>
        </>
      }
    >
      {/* All three sections share a single grid — narrow rows make each
          item a single line, sections sit side-by-side at lg+, stack at
          smaller breakpoints. Right-side meta (count / time) keeps the
          row scannable without wrapping. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {data.pendingByStudy.length > 0 && (
          <Section
            label={`CANDIDATES TO REVIEW · ${totalPending(data.pendingByStudy)}`}
          >
            {data.pendingByStudy.map((p) => (
              <Row
                key={p.studyId}
                onClick={() =>
                  onAction({
                    kind: "tool",
                    toolName: "list_candidates_for_study",
                    toolArgs: { studyId: p.studyId },
                    displayText: `List candidates for ${p.studyName}`,
                  })
                }
                left={p.studyName || "Untitled study"}
                right={`${p.count} pending`}
              />
            ))}
          </Section>
        )}

        {data.recentStudies.length > 0 && (
          <Section label="RECENT STUDIES">
            {data.recentStudies.map((b) => (
              <Row
                key={b.studyId}
                // Click fires get_study → renders the detail card inline.
                // Same flow whether draft or active — the card itself
                // exposes an "Edit study" pill that loads chat history
                // for resumption. Keeps the chat thread continuous.
                onClick={() =>
                  onAction({
                    kind: "tool",
                    toolName: "get_study",
                    toolArgs: { studyId: b.studyId },
                    displayText: `Show me study: ${b.productName || "untitled"}`,
                  })
                }
                left={b.productName || "Untitled study"}
                right={
                  b.status === "draft"
                    ? `${formatRelativeTime(b.createdAt)} · draft`
                    : formatRelativeTime(b.createdAt)
                }
              />
            ))}
          </Section>
        )}

        {data.recentInterviews.length > 0 && (
          <Section label="RECENT INTERVIEWS">
            {data.recentInterviews.map((iv) => {
              const title = iv.contactName ?? "Interview";
              const onStudy = iv.studyName ? ` on ${iv.studyName}` : "";
              const duration = formatDuration(iv.durationSecs);
              // Status + duration is more useful than relative time here:
              // section heading already implies "recent". User asked
              // explicitly for status (and duration if available).
              const meta = duration ? `${iv.status} · ${duration}` : iv.status;
              return (
                <Row
                  key={iv.interviewId}
                  onClick={() =>
                    onAction({
                      kind: "tool",
                      toolName: "get_interview",
                      toolArgs: { interviewId: iv.interviewId },
                      displayText: `Show me interview: ${title}${onStudy}`,
                    })
                  }
                  left={iv.studyName ? `${title} · ${iv.studyName}` : title}
                  right={meta}
                />
              );
            })}
          </Section>
        )}
      </div>
    </Panel>
  );
}

function countsLine(counts: {
  studies: number;
  candidates: number;
  interviews: number;
}): string {
  const studyWord = counts.studies === 1 ? "study" : "studies";
  const candWord = counts.candidates === 1 ? "candidate" : "candidates";
  const ivWord = counts.interviews === 1 ? "interview" : "interviews";
  return `${counts.studies} ${studyWord} · ${counts.candidates} ${candWord} · ${counts.interviews} ${ivWord}`;
}

function totalPending(rows: Array<{ count: number }>): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-1.5">
        {label}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Row({
  onClick,
  left,
  right,
}: {
  onClick: () => void;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex justify-between items-baseline gap-3 w-full text-left py-0.5 cursor-pointer hover:text-foreground transition-colors"
      >
        <span className="font-serif text-base leading-snug truncate">
          {left}
        </span>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground group-hover:text-accent shrink-0">
          {right}
        </span>
      </button>
    </li>
  );
}
