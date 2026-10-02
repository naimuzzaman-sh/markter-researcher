type Kind = 'brief' | 'candidate' | 'interview';

type Color = 'amber' | 'emerald' | 'muted' | 'red';

const COLOR_CLASS: Record<Color, string> = {
  amber: 'text-amber-700 border-amber-700/40',
  emerald: 'text-emerald-700 border-emerald-700/40',
  muted: 'text-muted-foreground border-border',
  red: 'text-destructive border-destructive/40',
};

function pillColor(kind: Kind, value: string): Color {
  if (kind === 'brief') {
    if (value === 'draft') return 'amber';
    if (value === 'active') return 'emerald';
    return 'muted';
  }
  if (kind === 'candidate') {
    if (value === 'pending_review' || value === 'discovered' || value === 'scheduled') {
      return 'amber';
    }
    if (value === 'approved' || value === 'contacted') return 'emerald';
    if (value === 'rejected') return 'red';
    return 'muted';
  }
  // interview
  if (value === 'failed') return 'red';
  if (value === 'completed') return 'emerald';
  return 'muted';
}

export function StatusPill({ kind, value }: { kind: Kind; value: string }) {
  const color = pillColor(kind, value);
  const label = value.replace(/_/g, ' ').toUpperCase();
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2 py-0.5 ${COLOR_CLASS[color]}`}
    >
      {label}
    </span>
  );
}
