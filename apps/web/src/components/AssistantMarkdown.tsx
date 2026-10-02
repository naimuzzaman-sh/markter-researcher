import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Render the assistant's prose with editorial styling. The model emits
 * markdown (bold, italics, lists, occasional inline code) and the raw
 * `whitespace-pre-wrap` `<p>` was rendering it as literal `**bold**`.
 *
 * Component overrides keep the typography consistent with the rest of
 * the chat — serif for body copy, mono for code, accent kicker for
 * blockquotes, etc. We deliberately don't render headings or images:
 * the agent shouldn't be emitting those, and if it does they'd look
 * out of place inside a turn.
 */
export function AssistantMarkdown({ source }: { source: string }) {
  return (
    <div
      className="font-serif text-lg leading-relaxed text-foreground max-w-2xl space-y-3"
      style={{ fontVariationSettings: "'opsz' 18" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Each paragraph is a real <p>; spacing is controlled by the
          // wrapping div's `space-y-3` so consecutive paragraphs breathe.
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-6 space-y-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-6 space-y-1.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children }) => (
            <code className="font-mono text-[0.9em] bg-foreground/5 px-1.5 py-0.5 rounded">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 decoration-accent/60 hover:decoration-accent"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="pl-4 border-l-2 border-accent/40 italic text-foreground/85">
              {children}
            </blockquote>
          ),
          // Reject inline images — model shouldn't be emitting these and
          // unconstrained <img> in a chat is a footgun.
          img: () => null,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
