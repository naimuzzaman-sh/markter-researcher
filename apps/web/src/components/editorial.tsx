import type { ReactNode } from 'react';

type EditorialLayoutProps = {
  children: ReactNode;
  issueLabel: string;
  statusLabel: string;
};

function EditorialLayout({
  children,
  issueLabel,
  statusLabel,
}: EditorialLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
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
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
            {statusLabel}
          </div>
        </div>
      </header>
      <div className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-12">{children}</div>
      </div>
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        {label}
      </div>
      <div>{children}</div>
    </section>
  );
}

function TypingDots({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  return (
    <div className="flex gap-1.5">
      <span className={`typing-dot ${cls} rounded-full bg-foreground/60`} />
      <span className={`typing-dot ${cls} rounded-full bg-foreground/60`} />
      <span className={`typing-dot ${cls} rounded-full bg-foreground/60`} />
    </div>
  );
}

function SentimentPill({
  sentiment,
}: {
  sentiment: 'positive' | 'neutral' | 'negative';
}) {
  const color =
    sentiment === 'positive'
      ? 'text-emerald-700 border-emerald-700/30'
      : sentiment === 'negative'
        ? 'text-destructive border-destructive/40'
        : 'text-muted-foreground border-border';
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.2em] uppercase border rounded-full px-2.5 py-1 ${color}`}
    >
      {sentiment}
    </span>
  );
}

export { EditorialLayout, Kicker, Section, TypingDots, SentimentPill };
