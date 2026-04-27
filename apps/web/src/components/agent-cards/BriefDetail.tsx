import type { ResearchContext } from "@mirrars/shared";
import type { ReactNode } from "react";
import { ActionPill } from "./ActionPill";
import { formatRelativeTime } from "./format-relative-time";
import { Panel } from "./Panel";
import type { CardRendererProps } from "./types";

// Wire shape for `get_brief` / `create_brief` / `update_brief` /
// `preview_brief` results: `briefId` field, not bare `id`. (preview_brief
// returns a draft without a real id; it falls back to '' which disables
// id-dependent pills.) `interviewUrl` is the public sharing link the
// server builds from `webOrigin` — null for preview_brief.
type BriefDetailResult = {
  briefId?: string | null;
  researchContext: ResearchContext;
  createdAt: string | Date | null;
  interviewUrl?: string | null;
};

export function BriefDetail({ result, onAction }: CardRendererProps) {
  const brief = result as BriefDetailResult;
  const ctx = brief.researchContext;
  const productName = ctx.product?.name ?? "Untitled brief";
  const briefId = brief.briefId ?? "";
  const interviewUrl = brief.interviewUrl ?? null;
  const subtitleParts = [
    ctx.company?.name,
    ctx.company?.industry,
    brief.createdAt ? `created ${formatRelativeTime(brief.createdAt)}` : null,
  ].filter(Boolean);

  const hypothesis = ctx.research?.productMarketFit?.hypothesis;
  const signals = ctx.research?.productMarketFit?.signals ?? [];
  const concerns = ctx.research?.concerns ?? [];

  return (
    <Panel
      kicker="BRIEF"
      title={productName}
      subtitle={subtitleParts.join(" · ")}
      actions={
        // Tool-driven action pills only render when we have a real
        // briefId — `preview_brief` results don't carry one. In that
        // case the only sensible follow-up is the LLM-driven "Create
        // this brief" prompt.
        briefId ? (
          <>
            <ActionPill
              variant="solid"
              action={{
                kind: "tool",
                toolName: "find_candidates",
                toolArgs: { briefId },
                displayText: `Find candidates for ${productName}`,
              }}
              onAction={onAction}
            >
              Find candidates →
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
                toolName: "list_candidates_for_brief",
                toolArgs: { briefId },
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
                toolArgs: { briefId },
                displayText: `List interviews for ${productName}`,
              }}
              onAction={onAction}
            >
              View interviews
            </ActionPill>
            <ActionPill
              action={{ kind: "prompt", text: `Edit brief: ${productName}` }}
              onAction={onAction}
            >
              Edit brief
            </ActionPill>
          </>
        ) : (
          <ActionPill
            variant="solid"
            action={{ kind: "prompt", text: "Create this brief" }}
            onAction={onAction}
          >
            Create brief →
          </ActionPill>
        )
      }
    >
      <div className="space-y-4">
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
