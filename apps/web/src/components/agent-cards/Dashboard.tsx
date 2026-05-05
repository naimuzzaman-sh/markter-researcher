import type { ReactNode } from "react";
import { ActionPill } from "./ActionPill";
import { formatDuration } from "./format-duration";
import { formatRelativeTime } from "./format-relative-time";
import { Panel } from "./Panel";
import type { CardRendererProps } from "./types";

type DashboardData = {
  empty: boolean;
  counts: { briefs: number; candidates: number; interviews: number };
  pendingByBrief: Array<{ briefId: string; briefName: string; count: number }>;
  recentBriefs: Array<{
    briefId: string;
    productName: string;
    companyName: string;
    status: "draft" | "active";
    createdAt: string;
  }>;
  recentInterviews: Array<{
    interviewId: string;
    briefId: string | null;
    briefName: string | null;
    contactName: string | null;
    status: "completed" | "failed";
    durationSecs: number | null;
    completedAt: string | null;
  }>;
};

/**
 * First-turn orientation card. Two flavours:
 *   - empty (no briefs yet)  → onboarding panel + single CTA
 *   - populated              → counts in the kicker · pending queue ·
 *                              recent briefs · recent interviews
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
            action={{ kind: "prompt", text: "Create a new brief" }}
            onAction={onAction}
          >
            Create your first brief →
          </ActionPill>
        }
      >
        <p className="font-serif text-base leading-relaxed text-muted-foreground max-w-xl">
          Create a brief, find candidates, send invites, then review their
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
            action={{ kind: "prompt", text: "Create a new brief" }}
            onAction={onAction}
          >
            Create brief →
          </ActionPill>
          <ActionPill
            action={{
              kind: "tool",
              toolName: "list_briefs",
              toolArgs: {},
              displayText: "List my briefs",
            }}
            onAction={onAction}
          >
            All briefs
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
        {data.pendingByBrief.length > 0 && (
          <Section
            label={`CANDIDATES TO REVIEW · ${totalPending(data.pendingByBrief)}`}
          >
            {data.pendingByBrief.map((p) => (
              <Row
                key={p.briefId}
                onClick={() =>
                  onAction({
                    kind: "tool",
                    toolName: "list_candidates_for_brief",
                    toolArgs: { briefId: p.briefId },
                    displayText: `List candidates for ${p.briefName}`,
                  })
                }
                left={p.briefName || "Untitled brief"}
                right={`${p.count} pending`}
              />
            ))}
          </Section>
        )}

        {data.recentBriefs.length > 0 && (
          <Section label="RECENT BRIEFS">
            {data.recentBriefs.map((b) => (
              <Row
                key={b.briefId}
                // Click fires get_brief → renders the detail card inline.
                // Same flow whether draft or active — the card itself
                // exposes an "Edit brief" pill that loads chat history
                // for resumption. Keeps the chat thread continuous.
                onClick={() =>
                  onAction({
                    kind: "tool",
                    toolName: "get_brief",
                    toolArgs: { briefId: b.briefId },
                    displayText: `Show me brief: ${b.productName || "untitled"}`,
                  })
                }
                left={b.productName || "Untitled brief"}
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
              const onBrief = iv.briefName ? ` on ${iv.briefName}` : "";
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
                      displayText: `Show me interview: ${title}${onBrief}`,
                    })
                  }
                  left={iv.briefName ? `${title} · ${iv.briefName}` : title}
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
  briefs: number;
  candidates: number;
  interviews: number;
}): string {
  const briefWord = counts.briefs === 1 ? "brief" : "briefs";
  const candWord = counts.candidates === 1 ? "candidate" : "candidates";
  const ivWord = counts.interviews === 1 ? "interview" : "interviews";
  return `${counts.briefs} ${briefWord} · ${counts.candidates} ${candWord} · ${counts.interviews} ${ivWord}`;
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
