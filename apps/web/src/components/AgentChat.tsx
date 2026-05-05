import {
  postChat,
  runTool,
  type Artifact,
  type ArtifactRef,
  type ChatMessage,
  type PillAction,
} from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { renderArtifact } from "./agent-cards";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { AuthBadge } from "./editorial";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type Turn = {
  role: "user" | "assistant";
  content: string;
  artifact?: Artifact | null;
  // Round-trips with the server so future turns get "Entities in scope".
  // Set by server; client treats as opaque carry-forward state.
  artifactRef?: ArtifactRef | null;
};

type AgentChatProps = {
  /** Masthead right-hand label — e.g. "Assistant". */
  statusLabel?: string;
  /** Masthead kicker — e.g. "Issue № 001 — Assistant". */
  issueLabel?: string;
};

/**
 * Editorial chat shell: fixed masthead, scrollable column, sticky input.
 * `h-screen flex flex-col` so the middle region overflows instead of pushing
 * the input off-screen. Tool results render as structured cards via the
 * `agent-cards` registry; tool-call chips are intentionally NOT rendered.
 */
export default function AgentChat({
  statusLabel = "Assistant",
  issueLabel = "Issue № 001 — Assistant",
}: AgentChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Guards the auto-fire dashboard call against React 18 StrictMode's
  // double-invoke and any stray remounts.
  const dashboardFiredRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Defer a frame so React commits the new DOM before we measure
    // scrollHeight — otherwise we scroll one message short of the bottom.
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [turns, isThinking]);

  // First-turn orientation: fire `get_dashboard` on mount so the user
  // lands on a live snapshot instead of an empty chat. No briefId
  // branching anymore — the brief flow is entered by clicking a card
  // / pill, not by URL anchoring.
  useEffect(() => {
    if (dashboardFiredRef.current) return;
    dashboardFiredRef.current = true;
    let cancelled = false;
    (async () => {
      setIsThinking(true);
      try {
        const response = await runTool("get_dashboard", {});
        if (cancelled) return;
        setTurns([
          {
            role: "assistant",
            content: response.reply,
            artifact: response.artifact,
            artifactRef: response.artifactRef,
          },
        ]);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard",
          );
        }
      } finally {
        if (!cancelled) setIsThinking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  // Free-typed messages and prompt-style pill actions: route through the
  // LLM at /chat. Wire messages preserve `artifactRef` on assistant turns
  // so the server can rebuild the "Entities in scope" block.
  const handleSendText = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isThinking) return;

      const userTurn: Turn = { role: "user", content: text };
      const nextTurns = [...turns, userTurn];
      setTurns(nextTurns);
      setIsThinking(true);
      setError(null);

      try {
        const wireMessages: ChatMessage[] = nextTurns.map((t) =>
          t.role === "assistant"
            ? {
                role: "assistant",
                content: t.content,
                ...(t.artifactRef ? { artifactRef: t.artifactRef } : {}),
              }
            : { role: "user", content: t.content },
        );
        const response = await postChat(wireMessages);
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.reply,
            artifact: response.artifact,
            artifactRef: response.artifactRef,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chat failed");
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, turns],
  );

  // Pill actions of type 'tool' bypass the LLM entirely. Tool name + args
  // are already known at the click site; we just need the server to run
  // the tool and stamp the artifact. Result is appended as a synthetic
  // assistant turn that looks identical to an LLM-produced one.
  const handleRunTool = useCallback(
    async (
      displayText: string,
      toolName: string,
      toolArgs: Record<string, unknown>,
    ) => {
      if (isThinking) return;
      const userTurn: Turn = { role: "user", content: displayText };
      setTurns((prev) => [...prev, userTurn]);
      setIsThinking(true);
      setError(null);
      try {
        const response = await runTool(toolName, toolArgs, { displayText });
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.reply,
            artifact: response.artifact,
            artifactRef: response.artifactRef,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking],
  );

  const handleSend = useCallback(async () => {
    const text = input;
    setInput("");
    await handleSendText(text);
  }, [input, handleSendText]);

  // "Edit brief" pill — append the brief's persisted chat_history below
  // the existing chat, then send "Edit brief: <name>" as the next user
  // turn. Append (not replace) preserves the user's pre-existing chat
  // state — they can scroll up and see what they were doing before
  // pivoting to this brief. The agent receives the full thread and
  // picks up from the most recent in-thread turn (the loaded brief's
  // last message), which the system prompt nudges it toward.
  const handleEditStudy = useCallback(
    async (
      rawHistory: Array<{
        role: "user" | "assistant";
        content: string;
        artifact?: unknown;
        artifactRef?: unknown;
      }>,
      productName: string,
    ) => {
      if (isThinking) return;

      const historyTurns: Turn[] = rawHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        // Strip click-pattern noise from legacy persisted histories.
        // Older `/run-tool` runs persisted view-only clicks like
        // "Show me study: X" / "Edit study: X" (and the legacy "brief" variants) + their detail cards;
        // re-hydrating them looks like a loop. New rows skip these
        // (server-side filter), but already-stored data still has
        // them. Treat any "Show me brief: …" / "Edit brief: …" user
        // turn (and the assistant reply that immediately follows) as
        // throwaway.
        .filter((m, i, arr) => {
          if (m.role === "user") {
            return !/^(show me (brief|study)|edit (brief|study)):/i.test(m.content);
          }
          // Drop the assistant turn that responded to a stripped click.
          const prev = arr[i - 1];
          if (
            prev &&
            prev.role === "user" &&
            /^(show me (brief|study)|edit (brief|study)):/i.test(prev.content)
          ) {
            return false;
          }
          return true;
        })
        .map((m) => ({
          role: m.role,
          content: m.content,
          artifact: (m.artifact as Artifact | null) ?? null,
          artifactRef: (m.artifactRef as ArtifactRef | null) ?? null,
        }));

      const editText = `Edit study: ${productName}`;
      const userTurn: Turn = { role: "user", content: editText };
      // Append: existing in-memory turns first, then the study's
      // persisted history, then the edit prompt. Order matters — the
      // agent treats the LAST turns as "current context" and resumes
      // from there.
      const nextTurns: Turn[] = [...turns, ...historyTurns, userTurn];
      setTurns(nextTurns);
      setIsThinking(true);
      setError(null);

      try {
        const wireMessages: ChatMessage[] = nextTurns.map((t) =>
          t.role === "assistant"
            ? {
                role: "assistant",
                content: t.content,
                ...(t.artifactRef ? { artifactRef: t.artifactRef } : {}),
              }
            : { role: "user", content: t.content },
        );
        const response = await postChat(wireMessages);
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.reply,
            artifact: response.artifact,
            artifactRef: response.artifactRef,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chat failed");
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, turns],
  );

  // Single dispatcher for all card/pill clicks. Routes by action.kind so
  // pills don't need to know about endpoints.
  const handleAction = useCallback(
    (action: PillAction) => {
      switch (action.kind) {
        case "tool":
          void handleRunTool(
            action.displayText,
            action.toolName,
            action.toolArgs,
          );
          break;
        case "prompt":
          void handleSendText(action.text);
          break;
        case "href":
          window.open(action.url, "_blank", "noopener,noreferrer");
          break;
        case "mailto":
          window.location.href = `mailto:${action.address}`;
          break;
        case "copy":
          // Local-only side effect — no chat turn. ActionPill manages its
          // own ephemeral "Copied ✓" feedback state.
          void navigator.clipboard.writeText(action.text).catch((err) => {
            setError(
              err instanceof Error
                ? `Couldn't copy: ${err.message}`
                : "Couldn't copy to clipboard",
            );
          });
          break;
        case "navigate":
          navigate(action.url);
          break;
        case "edit-study": {
          // Dedup by content: if any prior user turn was already an
          // `Edit study: <productName>` for this study, the click is
          // a repeat → silent no-op. Survives component remounts /
          // HMR because it reads `turns` (which is restored from
          // chat_history on re-mount), not a ref.
          const editPrompt = `Edit study: ${action.productName}`;
          const alreadyEdited = turns.some(
            (t) => t.role === "user" && t.content === editPrompt,
          );
          if (alreadyEdited) break;
          void handleEditStudy(action.chatHistory, action.productName);
          break;
        }
      }
    },
    [handleRunTool, handleSendText, navigate, handleEditStudy, turns],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Masthead */}
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-sm z-10 shrink-0">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {issueLabel}
            </div>
            <h1
              className="font-serif text-2xl mt-1 tracking-tight"
              style={{ fontVariationSettings: "'opsz' 36" }}
            >
              Mirars
            </h1>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {statusLabel}
            </div>
            <AuthBadge />
          </div>
        </div>
      </header>

      {/* Messages scroll — wider than masthead/input so card grids can show
          2 or 3 list items per row without horizontal scrolling. Prose
          paragraphs are clamped narrower inside MessageRow. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          {turns.map((t, i) => (
            <MessageRow key={i} turn={t} index={i} onAction={handleAction} />
          ))}

          {isThinking && <TypingRow />}

          {error && (
            <div className="font-mono text-xs text-destructive border-l-2 border-destructive pl-3">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border/60 bg-background/85 backdrop-blur-sm shrink-0">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-end gap-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground pb-3 pt-3 shrink-0">
              You —
            </span>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a question or command…  (⏎ to send, ⇧⏎ for newline)"
              disabled={isThinking}
              className="flex-1 bg-transparent border-0 shadow-none focus-visible:ring-0 font-serif text-base leading-relaxed placeholder:italic placeholder:text-muted-foreground/60 min-h-[44px] max-h-[200px] py-3"
              rows={1}
            />
            <Button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isThinking}
              className="shrink-0 rounded-full h-10 px-5 font-mono text-[11px] tracking-[0.15em] uppercase bg-foreground text-background hover:bg-accent"
            >
              Send →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  turn,
  index,
  onAction,
}: {
  turn: Turn;
  index: number;
  onAction: (action: PillAction) => void;
}) {
  const isAssistant = turn.role === "assistant";
  const attributionLabel = isAssistant ? "Researcher" : "You";
  return (
    <article
      className="slide-in"
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2">
        {attributionLabel} —{" "}
        <span className="text-muted-foreground">
          № {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {isAssistant ? (
        <>
          {turn.content && <AssistantMarkdown source={turn.content} />}
          {turn.artifact && (
            <div className="mt-4">
              {renderArtifact(turn.artifact, onAction)}
            </div>
          )}
        </>
      ) : (
        <p className="text-base leading-relaxed text-foreground/85 whitespace-pre-wrap pl-4 border-l-2 border-border max-w-2xl">
          {turn.content}
        </p>
      )}
    </article>
  );
}

function TypingRow() {
  return (
    <div className="slide-in">
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2">
        Researcher —
      </div>
      <div className="flex gap-1.5 py-2">
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
      </div>
    </div>
  );
}

