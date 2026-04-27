import type { ReactNode, MouseEventHandler, KeyboardEventHandler } from 'react';

type Variant = 'default' | 'tight' | 'error' | 'empty';

type Props = {
  kicker: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  role?: string;
  variant?: Variant;
};

const VARIANT_BG: Record<Variant, string> = {
  default: 'border-border/60 bg-card',
  tight: 'border-border/60 bg-card',
  error: 'border-destructive/40 bg-destructive/5',
  empty: 'border-dashed border-border bg-transparent',
};

const VARIANT_PADDING: Record<Variant, string> = {
  default: 'p-6',
  tight: 'p-4',
  error: 'p-4',
  empty: 'p-6 text-center',
};

// Sticky-action footer needs a translucent fill so body text doesn't bleed
// through. Tailwind v4 needs each class literal in source for JIT, so the
// values are spelled out per variant.
const STICKY_ACTION_FILL: Record<Variant, string> = {
  default: 'bg-card/95',
  tight: 'bg-card/95',
  error: 'bg-destructive/5',
  empty: 'bg-transparent',
};

const STICKY_ACTION_INSET: Record<Variant, string> = {
  default: '-mx-6 px-6 -mb-6 pb-6',
  tight: '-mx-4 px-4 -mb-4 pb-4',
  error: '-mx-4 px-4 -mb-4 pb-4',
  empty: '-mx-6 px-6 -mb-6 pb-6',
};

/**
 * Editorial card primitive. Slots:
 *   kicker (mono, accent) · title (serif, large) · subtitle (italic) ·
 *   children (body) · actions (footer, hairline-divided).
 *
 * Set `onClick` + `role="button"` to make the whole panel clickable
 * (used for list-card → detail navigation in the chat).
 */
export function Panel({
  kicker,
  title,
  subtitle,
  children,
  actions,
  onClick,
  role,
  variant = 'default',
}: Props) {
  const interactive = onClick !== undefined;
  const handleKey: KeyboardEventHandler<HTMLDivElement> | undefined = interactive
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(
            e as unknown as React.MouseEvent<HTMLDivElement>,
          );
        }
      }
    : undefined;

  return (
    <div
      role={role}
      onClick={onClick}
      onKeyDown={handleKey}
      tabIndex={interactive ? 0 : undefined}
      className={`border ${VARIANT_BG[variant]} ${VARIANT_PADDING[variant]} ${
        interactive ? 'cursor-pointer transition-colors hover:border-foreground/40' : ''
      }`}
    >
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        {kicker}
      </div>
      <h2
        className="font-serif text-2xl mt-1 leading-tight tracking-tight"
        style={{ fontVariationSettings: "'opsz' 36" }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="font-serif italic text-muted-foreground text-base mt-1">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
      {actions && (
        // Sticky to the bottom of the chat scroll viewport so the user can
        // act on long detail panels (briefs with many questions, interviews
        // with full transcript, etc.) without scrolling to the end. The
        // negative horizontal/bottom margins extend the backdrop through
        // the panel padding so body text doesn't bleed under the pills.
        <div
          data-slot="actions"
          className={`flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/60 sticky bottom-0 backdrop-blur-sm ${STICKY_ACTION_FILL[variant]} ${STICKY_ACTION_INSET[variant]}`}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
