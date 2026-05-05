import type { ResearchContext } from "@mirrars/shared";
import type { ReactNode } from "react";
import type { PillAction } from "@/lib/api";
import { ActionPill } from "./ActionPill";
import { formatRelativeTime } from "./format-relative-time";
import { Panel } from "./Panel";
import type { CardRendererProps } from "./types";

// Wire shape for `get_study` / `create_study` / `update_study` /
// `preview_study` results: `studyId` field, not bare `id`. (preview_study
// returns a draft without a real id; it falls back to '' which disables
// id-dependent pills.) `interviewUrl` is the public sharing link the
// server builds from `webOrigin` — null for preview_study.
type ChatHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
  artifact?: unknown;
  artifactRef?: unknown;
};

type StudyResults = {
  summary: string;
  themes: string[];
  painPoints: string[];
  pmfSignalsObserved: string[];
  recommendations: string[];
  interviewCount: number;
  lastUpdated: string;
};

type StudyDetailResult = {
  studyId?: string | null;
  researchContext: ResearchContext;
  /**
   * Lifecycle state. 'draft' = study is being assembled in chat, may
   * be partial. 'active' = fully populated, ready for discovery.
   * Optional for backward compat with `preview_study` (which doesn't
   * persist anything) and any pre-migration clients.
   */
  status?: 'draft' | 'active';
  /**
   * Persisted study-creation/edit conversation. `get_study` populates
   * this; `preview_study` doesn't. The Edit pill ships it back into
   * the chat shell so the user resumes from where they left off.
   */
  chatHistory?: ChatHistoryEntry[];
  /**
   * Study-level synthesis across all completed interviews. Populated
   * by the post-interview summarizer; null until the first interview
   * lands. Renders as a dedicated RESULTS section on the card.
   */
  results?: StudyResults | null;
  createdAt: string | Date | null;
  interviewUrl?: string | null;
};

export function StudyDetail({ result, onAction }: CardRendererProps) {
  const study = result as StudyDetailResult;
  const ctx = study.researchContext;
  const productName = ctx.product?.name ?? "Untitled study";
  const studyId = study.studyId ?? "";
  const interviewUrl = study.interviewUrl ?? null;
  const subtitleParts = [
    ctx.company?.name,
    ctx.company?.industry,
    study.createdAt ? `created ${formatRelativeTime(study.createdAt)}` : null,
  ].filter(Boolean);

  const hypothesis = ctx.research?.productMarketFit?.hypothesis;
  const signals = ctx.research?.productMarketFit?.signals ?? [];
  const concerns = ctx.research?.concerns ?? [];

  return (
    <Panel
      kicker={study.status === 'draft' ? 'STUDY · DRAFT' : 'STUDY'}
      title={productName}
      subtitle={subtitleParts.join(" · ")}
      actions={renderActions(study, studyId, productName, interviewUrl, onAction)}
    >
      <div className="space-y-4">
        {study.results && <ResultsSection results={study.results} />}
        {ctx.research?.objective && (
          <Field label="OBJECTIVE" emphasized>
            {ctx.research.objective}
          </Field>
        )}
        {ctx.product?.targetAudience && (
          <Field label="TARGET AUDIENCE">{ctx.product.targetAudience}</Field>
        )}
        {ctx.product?.description && (
          <Field label="PRODUCT">{ctx.product.description}</Field>
        )}
        {ctx.product?.keyFeatures && ctx.product.keyFeatures.length > 0 && (
          <FieldList
            label={`KEY FEATURES · ${ctx.product.keyFeatures.length}`}
            items={ctx.product.keyFeatures}
            numbered
          />
        )}
        {ctx.research?.questions && ctx.research.questions.length > 0 && (
          <div>
            <FieldLabel>QUESTIONS · {ctx.research.questions.length}</FieldLabel>
            <ol className="mt-2 space-y-3">
              {ctx.research.questions.map((q, i) => (
                <li key={q.id ?? i} className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-serif text-base leading-relaxed">
                      {q.text}
                    </p>
                    {q.category && (
                      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground mt-1">
                        {q.category.replace(/-/g, " ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {hypothesis && <Field label="HYPOTHESIS">{hypothesis}</Field>}
        {signals.length > 0 && (
          <FieldList
            label={`PMF SIGNALS · ${signals.length}`}
            items={signals}
          />
        )}
        {concerns.length > 0 && (
          <FieldList label={`CONCERNS · ${concerns.length}`} items={concerns} />
        )}
      </div>
    </Panel>
  );
}

/**
 * Aggregated findings across all completed interviews. Rendered above
 * the study's static fields when `results` is non-null — drawing the
 * researcher's eye to the synthesis that's the point of the whole
 * exercise. Refreshes after every new interview lands (server fires
 * the summarizer on call-end).
 */
function ResultsSection({ results }: { results: StudyResults }) {
  return (
    <div className="border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
          Results · {results.interviewCount}{" "}
          {results.interviewCount === 1 ? "interview" : "interviews"}
        </span>
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
          updated {formatRelativeTime(results.lastUpdated)}
        </span>
      </div>
      <p
        className="font-serif italic text-base leading-relaxed mt-3 text-foreground/90"
        style={{ fontVariationSettings: "'opsz' 18" }}
      >
        {results.summary}
      </p>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {results.themes.length > 0 && (
          <ResultsBlock label={`Themes · ${results.themes.length}`} items={results.themes} />
        )}
        {results.painPoints.length > 0 && (
          <ResultsBlock
            label={`Pain points · ${results.painPoints.length}`}
            items={results.painPoints}
          />
        )}
        {results.pmfSignalsObserved.length > 0 && (
          <ResultsBlock
            label={`PMF signals · ${results.pmfSignalsObserved.length}`}
            items={results.pmfSignalsObserved}
          />
        )}
        {results.recommendations.length > 0 && (
          <ResultsBlock
            label={`Recommendations · ${results.recommendations.length}`}
            items={results.recommendations}
          />
        )}
      </div>
    </div>
  );
}

function ResultsBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-accent/80">
        {label}
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="font-serif text-sm leading-snug text-foreground/85 flex gap-2"
          >
            <span className="text-accent shrink-0">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  emphasized,
}: {
  label: string;
  children: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p
        className={`mt-1.5 font-serif leading-relaxed ${
          emphasized ? "text-lg" : "text-base"
        }`}
        style={emphasized ? { fontVariationSettings: "'opsz' 24" } : undefined}
      >
        {children}
      </p>
    </div>
  );
}

function FieldList({
  label,
  items,
  numbered,
}: {
  label: string;
  items: string[];
  numbered?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {numbered ? (
        <ol className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="font-serif text-base leading-relaxed flex gap-3"
            >
              <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mt-2 list-disc pl-6 space-y-1 font-serif text-base leading-relaxed">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Action pills branch by lifecycle, but the body of the card (fields,
 * layout, typography) stays uniform — drafts and active studies share
 * the same details view. Only the affordances differ:
 *
 *   • No studyId (preview_study result, never persisted)
 *       → "Create study →" prompt only
 *
 *   • Draft (status === 'draft', studyId set)
 *       → "Edit study →" only. Find candidates, view interviews,
 *         copy invite link are all premature on a study that isn't
 *         done yet — they unlock when the user promotes to active.
 *
 *   • Active (status === 'active' or absent — legacy studies default
 *     active per the migration backfill)
 *       → full action set: edit, discovery, copy invite, view
 *         candidates, view interviews
 *
 * Edit dispatches an `edit-study` action carrying chat history so
 * AgentChat can append prior conversation onto the existing thread
 * without an extra round-trip.
 */
function renderActions(
  study: StudyDetailResult,
  studyId: string,
  productName: string,
  interviewUrl: string | null,
  onAction: (action: PillAction) => void,
): ReactNode {
  if (!studyId) {
    return (
      <ActionPill
        variant="solid"
        action={{ kind: "prompt", text: "Create this study" }}
        onAction={onAction}
      >
        Create study →
      </ActionPill>
    );
  }

  const editAction: PillAction = {
    kind: "edit-study",
    studyId,
    productName,
    chatHistory: study.chatHistory ?? [],
  };

  if (study.status === "draft") {
    return (
      <ActionPill variant="solid" action={editAction} onAction={onAction}>
        Edit study →
      </ActionPill>
    );
  }

  return (
    <>
      <ActionPill variant="solid" action={editAction} onAction={onAction}>
        Edit study →
      </ActionPill>
      <ActionPill
        action={{
          kind: "tool",
          toolName: "find_candidates",
          toolArgs: { studyId },
          displayText: `Find candidates for ${productName}`,
        }}
        onAction={onAction}
      >
        Find candidates
      </ActionPill>
      {interviewUrl && (
        <ActionPill
          action={{ kind: "copy", text: interviewUrl }}
          onAction={onAction}
        >
          Copy interview link
        </ActionPill>
      )}
      <ActionPill
        action={{
          kind: "tool",
          toolName: "list_candidates_for_study",
          toolArgs: { studyId },
          displayText: `List candidates for ${productName}`,
        }}
        onAction={onAction}
      >
        View candidates
      </ActionPill>
      <ActionPill
        action={{
          kind: "tool",
          toolName: "list_interviews",
          toolArgs: { studyId },
          displayText: `List interviews for ${productName}`,
        }}
        onAction={onAction}
      >
        View interviews
      </ActionPill>
    </>
  );
}
