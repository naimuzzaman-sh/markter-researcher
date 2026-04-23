import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useAuth } from '@/auth/AuthProvider';
import { postChat, type ChatMessage, type ChatToolCall } from '@/lib/api';

type Turn = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ChatToolCall[];
};

type AgentChatProps = {
  mode?: 'universal' | 'brief-setup';
  greeting?: string;
};

/**
 * Owns the viewport the same way SetupChat does: `h-screen flex flex-col`
 * with a fixed masthead, scroll region in the middle, sticky input at the
 * bottom. Do NOT wrap this in EditorialLayout — its padded container would
 * clip the height and push the input off-screen.
 */
export default function AgentChat({
  mode = 'universal',
  greeting = 'Ask me anything — I can list briefs, find candidates, inspect interviews, and more.',
}: AgentChatProps) {
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'assistant', content: greeting },
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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
      // Strip the client-side greeting — server only wants real user/assistant turns.
      const wireMessages: ChatMessage[] = nextTurns
        .slice(1)
        .map((t) => ({ role: t.role, content: t.content }));
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-sm z-10 shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Issue № 001 — Assistant
            </div>
            <h1
              className="font-serif text-2xl mt-1 tracking-tight"
              style={{ fontVariationSettings: "'opsz' 36" }}
            >
              The Interview Journal
            </h1>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
              /assistant
            </div>
            {user && (
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground truncate max-w-[160px]">
                  {user.email ?? user.phone ?? 'signed in'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/70 hover:text-foreground underline-offset-4 hover:underline"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
          {turns.map((t, i) => (
            <MessageBubble key={i} turn={t} />
          ))}
          {isThinking && (
            <div className="flex items-center gap-2 text-sm text-foreground/60 font-mono pl-1">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: '120ms' }} />
              <span className="typing-dot" style={{ animationDelay: '240ms' }} />
              <span className="ml-2">thinking…</span>
            </div>
          )}
          {error && (
            <div className="font-mono text-xs text-destructive border-l-2 border-destructive pl-3">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 bg-background/85 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-5">
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

function MessageBubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 bg-foreground text-background'
            : 'max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-foreground/5'
        }
      >
        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <div className="mb-3 space-y-2">
            {turn.toolCalls.map((tc, i) => (
              <ToolCallChip key={i} call={tc} />
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed font-serif">
          {turn.content}
        </p>
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
