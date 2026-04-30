import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';

type EditorialLayoutProps = {
  children: ReactNode;
  /** Mono uppercase label above the brand mark — page-context hint. Optional. */
  issueLabel?: string;
  /** Accent-colored status pill in the header right (e.g. "Filed", "Pending"). Optional. */
  statusLabel?: string;
  /**
   * Column width. `'narrow'` (default, max-w-2xl) keeps the editorial
   * tone for forms, single-column flows, and short-copy pages.
   * `'wide'` (max-w-4xl) gives marketing/landing-style spreads room
   * to breathe without losing the editorial constraint.
   * `'full'` (max-w-6xl) when a page wants edge-to-edge mock grids.
   */
  width?: 'narrow' | 'wide' | 'full';
  /** Optional content rendered below the main column (e.g. footer). */
  footer?: ReactNode;
};

const WIDTH_CLASS: Record<NonNullable<EditorialLayoutProps['width']>, string> = {
  narrow: 'max-w-2xl',
  wide: 'max-w-4xl',
  full: 'max-w-6xl',
};

function EditorialLayout({
  children,
  issueLabel,
  statusLabel,
  width = 'narrow',
  footer,
}: EditorialLayoutProps) {
  // Header masthead always tracks the body width so the rule under it
  // lines up; without this a wide body under a narrow header looks broken.
  const widthClass = WIDTH_CLASS[width];
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className={`${widthClass} mx-auto px-6 py-5 flex items-center justify-between`}>
          <div>
            {issueLabel && (
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                {issueLabel}
              </div>
            )}
            <h1
              className={`font-serif text-2xl tracking-tight ${issueLabel ? 'mt-1' : ''}`}
              style={{ fontVariationSettings: "'opsz' 36" }}
            >
              Mirars
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {statusLabel && (
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
                {statusLabel}
              </div>
            )}
            <AuthBadge />
          </div>
        </div>
      </header>
      <div className="flex-1">
        <div className={`${widthClass} mx-auto px-6 py-12`}>{children}</div>
      </div>
      {footer}
    </div>
  );
}

/**
 * Header-right account control. Signed-out → null (public pages stay
 * clean; the body provides Sign in / Create account CTAs where relevant).
 * Signed-in → 32px avatar pill (initial in a circle) opening a small
 * floating menu with the email, an "Open workspace" link, and Sign out.
 *
 * Implementation notes: native `<details>` would handle outside-click
 * automatically but it doesn't compose with React Router links cleanly,
 * and styling the `<summary>` marker reliably across browsers is
 * fiddly. A 30-line controlled popover with mousedown + Escape handlers
 * is the simpler trade.
 */
function AuthBadge() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!user) return null;

  const identifier = user.email ?? user.phone ?? 'signed in';
  const initial = (identifier.trim()[0] ?? 'M').toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center justify-center w-8 h-8 rounded-full border font-mono text-[12px] tracking-tight uppercase cursor-pointer transition-colors ${
          open
            ? 'border-foreground bg-foreground text-background'
            : 'border-border/60 text-foreground/80 hover:border-foreground hover:text-foreground'
        }`}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 border border-border/60 bg-card shadow-sm z-20"
        >
          <div className="px-4 pt-3 pb-2 border-b border-border/60">
            <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-accent">
              Signed in
            </div>
            <p className="font-serif text-sm leading-snug truncate mt-0.5" title={identifier}>
              {identifier}
            </p>
          </div>
          <div className="py-1">
            <Link
              to="/assistant"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="block px-4 py-2 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/80 hover:text-foreground hover:bg-accent/5 transition-colors"
            >
              Open workspace →
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              role="menuitem"
              className="w-full text-left px-4 py-2 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/80 hover:text-foreground hover:bg-accent/5 cursor-pointer transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
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
