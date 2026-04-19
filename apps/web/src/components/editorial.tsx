import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';

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
          <div className="flex items-baseline gap-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
              {statusLabel}
            </div>
            <AuthBadge />
          </div>
        </div>
      </header>
      <div className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-12">{children}</div>
      </div>
    </div>
  );
}

/**
 * Small signed-in affordance in the header: email + "Sign out" link.
 * Renders nothing if there's no session (keeps public pages clean).
 */
function AuthBadge() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const identifier = user.email ?? user.phone ?? 'signed in';

  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground truncate max-w-[160px]">
        {identifier}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/70 hover:text-foreground underline-offset-4 hover:underline"
      >
        Sign out
      </button>
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

export { EditorialLayout, Kicker, Section, TypingDots, SentimentPill, AuthBadge };
