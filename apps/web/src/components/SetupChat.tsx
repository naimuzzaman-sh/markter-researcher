import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { AuthBadge } from './editorial';
import { createBrief, startSetup, sendSetupMessage } from '@/lib/api';
import type { ResearchContext } from '@/types/research-context.type';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type SetupChatProps = {
  onBriefCreated: (briefId: string) => void;
};

function SetupChat({ onBriefCreated }: SetupChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [draftContext, setDraftContext] = useState<ResearchContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootRef = useRef(false);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        const { sessionId: id, firstMessage } = await startSetup();
        setSessionId(id);
        setMessages([{ role: 'assistant', content: firstMessage }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start setup');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Defer to next frame so React has committed the new DOM before we measure
    // scrollHeight. Otherwise the scroll can fire before the new message row
    // is painted and we end up 1 message short of the bottom.
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, isTyping]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !sessionId || isTyping) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsTyping(true);
    setError(null);

    try {
      const response = await sendSetupMessage(sessionId, text);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
      if (response.done && response.context) {
        setDraftContext(response.context);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsTyping(false);
    }
  }, [input, sessionId, isTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Dots />
      </div>
    );
  }

  if (draftContext) {
    return (
      <ContextReview
        context={draftContext}
        onCreate={onBriefCreated}
        onRefine={() => setDraftContext(null)}
      />
    );
  }

  return (
    // h-screen (not min-h-screen) so the flex-1 messages area gets a bounded
    // height and its overflow-y-auto actually scrolls instead of the whole
    // page. Also removes the need for the sticky masthead.
    <div className="h-screen flex flex-col">
      {/* Masthead */}
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-sm z-10 shrink-0">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Issue № 001 — Setup
            </div>
            <h1 className="font-serif text-2xl mt-1 tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
              The Interview Journal
            </h1>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Pre-brief
            </div>
            <AuthBadge />
          </div>
        </div>
      </header>

      {/* Messages scroll */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
          <Lead />

          {messages.map((msg, i) => (
            <MessageRow key={i} message={msg} index={i} />
          ))}

          {isTyping && <TypingRow />}

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
              placeholder="Type a response…  (⏎ to send, ⇧⏎ for newline)"
              disabled={isTyping}
              className="flex-1 bg-transparent border-0 shadow-none focus-visible:ring-0 font-serif text-base leading-relaxed placeholder:italic placeholder:text-muted-foreground/60 min-h-[44px] max-h-[200px] py-3"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
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

function Lead() {
  return (
    <div className="space-y-3 pb-4">
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        Prologue
      </div>
      <p className="font-serif text-xl leading-snug text-foreground max-w-xl" style={{ fontVariationSettings: "'opsz' 24" }}>
        Before we interview your users, tell me what you want to learn.
        I'll turn your intent into a tailored research brief.
      </p>
      <div className="hairline w-24 mt-6" />
    </div>
  );
}

function MessageRow({ message, index }: { message: Message; index: number }) {
  const isAssistant = message.role === 'assistant';
  return (
    <article
      className="slide-in"
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2">
        {isAssistant ? 'Researcher' : 'You'} — <span className="text-muted-foreground">№ {String(index + 1).padStart(2, '0')}</span>
      </div>
      {isAssistant ? (
        <p
          className="font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap"
          style={{ fontVariationSettings: "'opsz' 18" }}
        >
          {message.content}
        </p>
      ) : (
        <p className="text-base leading-relaxed text-foreground/85 whitespace-pre-wrap pl-4 border-l-2 border-border">
          {message.content}
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

function Dots() {
  return (
    <div className="flex gap-1.5">
      <span className="typing-dot w-2 h-2 rounded-full bg-foreground/60" />
      <span className="typing-dot w-2 h-2 rounded-full bg-foreground/60" />
      <span className="typing-dot w-2 h-2 rounded-full bg-foreground/60" />
    </div>
  );
}

function ContextReview({
  context,
  onCreate,
  onRefine,
}: {
  context: ResearchContext;
  onCreate: (briefId: string) => void;
  onRefine: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const { briefId } = await createBrief(context);
      onCreate(briefId);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create brief',
      );
      setIsCreating(false);
    }
  }, [context, isCreating, onCreate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Issue № 001 — Brief
            </div>
            <h1 className="font-serif text-2xl mt-1 tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
              The Interview Journal
            </h1>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
              Ready
            </div>
            <AuthBadge />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-12 space-y-10 slide-in">
          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
              Brief — Ready for launch
            </div>
            <h2 className="font-serif text-4xl mt-3 leading-[1.05] tracking-tight" style={{ fontVariationSettings: "'opsz' 72" }}>
              {context.product.name}
            </h2>
            <p className="font-serif text-lg text-muted-foreground mt-2 italic">
              {context.company.name} · {context.company.industry}
            </p>
          </div>

          <div className="hairline" />

          <Field label="Objective" body={context.research.objective} large />
          <Field label="Target audience" body={context.product.targetAudience} />
          <Field label="Product description" body={context.product.description} />

          <div>
            <FieldLabel>Key features</FieldLabel>
            <ul className="mt-3 space-y-1.5">
              {context.product.keyFeatures.map((f, i) => (
                <li key={i} className="font-serif text-base leading-relaxed flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <FieldLabel>
              Interview questions · {context.research.questions.length}
            </FieldLabel>
            <ol className="mt-3 space-y-4">
              {context.research.questions.map((q, i) => (
                <li key={q.id} className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground pt-2 w-6 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="font-serif text-base leading-relaxed">
                      {q.text}
                    </p>
                    <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground mt-1">
                      {q.category.replace('-', ' ')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {context.research.productMarketFit.hypothesis && (
            <Field
              label="Hypothesis"
              body={context.research.productMarketFit.hypothesis}
            />
          )}

          <div className="hairline" />

          {createError && (
            <p className="font-mono text-xs text-destructive border-l-2 border-destructive pl-3">
              {createError}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="rounded-full h-11 px-7 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isCreating ? 'Creating…' : 'Create interview →'}
            </Button>
            <Button
              onClick={onRefine}
              disabled={isCreating}
              variant="outline"
              className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5"
            >
              Refine brief
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Field({
  label,
  body,
  large,
}: {
  label: string;
  body: string;
  large?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p
        className={`mt-2 font-serif leading-relaxed ${
          large ? 'text-xl' : 'text-base'
        }`}
        style={large ? { fontVariationSettings: "'opsz' 24" } : undefined}
      >
        {body}
      </p>
    </div>
  );
}

export default SetupChat;
