import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PillAction } from "./types";

type Variant = "outline" | "solid" | "danger";

type Props = {
  children: ReactNode;
  action: PillAction;
  onAction: (action: PillAction) => void;
  variant?: Variant;
};

const BASE =
  "inline-flex items-center justify-center rounded-full px-4 py-2 font-mono text-[10px] tracking-[0.2em] uppercase border transition-colors cursor-pointer";

const VARIANT: Record<Variant, string> = {
  outline: "border-foreground/40 text-foreground hover:bg-foreground/5",
  solid: "border-foreground bg-foreground text-background hover:bg-accent",
  danger: "border-destructive/50 text-destructive hover:bg-destructive/5",
};

const COPIED_FLASH_MS = 1500;

/**
 * Action affordance. The action is a structured value, not a string —
 * the chat shell decides how to dispatch:
 *   - `tool`    → /run-tool (deterministic, no LLM)
 *   - `prompt`  → /chat (LLM, for ambiguous follow-ups)
 *   - `href`    → window.open
 *   - `mailto`  → mailto: link
 *   - `copy`    → navigator.clipboard, with ephemeral "Copied ✓" feedback
 *
 * Pills don't know about endpoints; they just declare the action.
 */
export function ActionPill({
  children,
  action,
  onAction,
  variant = "outline",
}: Props) {
  const cls = `${BASE} ${VARIANT[variant]}`;
  const [justCopied, setJustCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (action.kind === "href") {
    return (
      <a
        className={cls}
        href={action.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  if (action.kind === "mailto") {
    return (
      <a className={cls} href={`mailto:${action.address}`}>
        {children}
      </a>
    );
  }

  const handleClick = () => {
    onAction(action);
    if (action.kind === "copy") {
      setJustCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustCopied(false), COPIED_FLASH_MS);
    }
  };

  return (
    <button type="button" className={cls} onClick={handleClick}>
      {action.kind === "copy" && justCopied ? "Copied ✓" : children}
    </button>
  );
}
