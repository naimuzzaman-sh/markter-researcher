type Sentiment = 'positive' | 'neutral' | 'negative';

const COLOR: Record<Sentiment, string> = {
  positive: 'text-emerald-700 border-emerald-700/40',
  neutral: 'text-muted-foreground border-border',
  negative: 'text-destructive border-destructive/40',
};

export function SentimentPill({ value }: { value: Sentiment }) {
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2 py-0.5 ${COLOR[value]}`}
    >
      {value.toUpperCase()}
    </span>
  );
}
