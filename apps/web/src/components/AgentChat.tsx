import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { AuthBadge } from './editorial';
import { postChat, type ChatMessage, type ChatToolCall } from '@/lib/api';

type Turn = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ChatToolCall[];
};

type AgentChatProps = {
  mode?: 'universal' | 'brief-setup';
  /** Intro paragraph shown above the first message (Lead / Prologue). */
  greeting?: string;
  /** Masthead right-hand label — e.g. "Pre-brief", "Assistant". */
  statusLabel?: string;
  /** Masthead kicker — e.g. "Issue № 001 — Assistant". */
  issueLabel?: string;
  /** Prologue kicker — e.g. "Prologue", "Brief setup". */
  leadKicker?: string;
};

/**
 * Editorial chat shell (matches SetupChat's look): fixed masthead, scrollable
 * column, sticky input. `h-screen flex flex-col` on the root so the middle
 * region actually overflows instead of pushing the input off-screen — do NOT
 * wrap this in EditorialLayout.
 */
export default function AgentChat({
  mode = 'universal',
  greeting = "Ask me anything — I'll list briefs, find candidates, inspect interviews, and more.",
  statusLabel = 'Assistant',
  issueLabel = 'Issue № 001 — Assistant',
  leadKicker = 'Prologue',
}: AgentChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Defer a frame so React commits the new DOM before we measure
    // scrollHeight — otherwise we scroll one message short of the bottom.
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [turns, isThinking]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const userTurn: Turn = { role: 'user', content: text };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput('');
    setIsThinking(true);
    setError(null);

    try {
      const wireMessages: ChatMessage[] = nextTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const response = await postChat(wireMessages, mode);
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: response.reply, toolCalls: response.toolCalls },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, turns, mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Masthead */}
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-sm z-10 shrink-0">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {issueLabel}
            </div>
            <h1
              className="font-serif text-2xl mt-1 tracking-tight"
              style={{ fontVariationSettings: "'opsz' 36" }}
            >
              The Interview Journal
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

      {/* Messages scroll */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
          <Lead kicker={leadKicker} body={greeting} />

          {turns.map((t, i) => (
            <MessageRow key={i} turn={t} index={i} />
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
        <div className="max-w-2xl mx-auto px-6 py-5">
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

function Lead({ kicker, body }: { kicker: string; body: string }) {
  return (
    <div className="space-y-3 pb-4">
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        {kicker}
      </div>
      <p
        className="font-serif text-xl leading-snug text-foreground max-w-xl"
        style={{ fontVariationSettings: "'opsz' 24" }}
      >
        {body}
      </p>
      <div className="hairline w-24 mt-6" />
    </div>
  );
}

function MessageRow({ turn, index }: { turn: Turn; index: number }) {
  const isAssistant = turn.role === 'assistant';
  const attributionLabel = isAssistant ? 'Researcher' : 'You';
  return (
    <article
      className="slide-in"
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2">
        {attributionLabel} —{' '}
        <span className="text-muted-foreground">
          № {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {isAssistant && turn.toolCalls && turn.toolCalls.length > 0 && (
        <div className="mb-3 space-y-2">
          {turn.toolCalls.map((tc, i) => (
            <ToolCallChip key={i} call={tc} />
          ))}
        </div>
      )}

      {isAssistant ? (
        <p
          className="font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap"
          style={{ fontVariationSettings: "'opsz' 18" }}
        >
          {turn.content}
        </p>
      ) : (
        <p className="text-base leading-relaxed text-foreground/85 whitespace-pre-wrap pl-4 border-l-2 border-border">
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

function ToolCallChip({ call }: { call: ChatToolCall }) {
  const [open, setOpen] = useState(false);
  const hasError = !!call.error;
  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden text-xs font-mono">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-foreground/5 hover:bg-foreground/10 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${hasError ? 'bg-red-500' : 'bg-green-500'}`}
          />
          <span className="font-semibold">{call.name}</span>
          <span className="text-foreground/50">{call.durationMs}ms</span>
        </span>
        <span
          className={`inline-block px-2 py-0.5 rounded border ${
            hasError
              ? 'bg-red-500/10 text-red-700 border-red-500/30'
              : 'bg-green-500/10 text-green-700 border-green-500/30'
          }`}
        >
          {hasError ? 'error' : 'ok'}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-background space-y-2">
          <div>
            <div className="text-foreground/50 mb-1">args</div>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-foreground/50 mb-1">{hasError ? 'error' : 'result'}</div>
            <pre className="whitespace-pre-wrap break-all">
              {call.error ?? JSON.stringify(call.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
