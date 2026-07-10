import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown component overrides for chat answers.
 *
 * Ordilo's design system has no monospace/display-font accents, so code
 * blocks fall back to the body font. Tables use the sand/mist tokens
 * (`--muted`, `--border`) already used for cards elsewhere in the app —
 * no new colors are introduced.
 */
const components: Components = {
  p: ({ children }) => (
    <p className="mb-2 text-sm leading-relaxed text-foreground last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--petrol)] underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>
  ),
  h2: ({ children }) => (
    <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>
  ),
  h3: ({ children }) => (
    <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto rounded-ordilo-sm border border-border last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-b-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 text-left font-medium text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2.5 py-1.5 align-top text-foreground">{children}</td>
  ),
  code: ({ children }) => (
    <code className="rounded-ordilo-sm bg-muted px-1 py-0.5 text-[0.85em]">
      {children}
    </code>
  ),
};

/**
 * Renders assistant chat answers as formatted Markdown (bold, lists,
 * tables via GFM) instead of raw text with literal `**asterisks**`.
 *
 * Used exclusively for AI-generated content in the chat/search UI —
 * user messages remain plain text (VAL-CHAT-034 safety still applies,
 * since react-markdown escapes raw HTML by default).
 */
export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
