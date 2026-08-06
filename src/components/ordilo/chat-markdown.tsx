import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ChatCitation {
  /** 1-based index — shown as the inline "[N]" marker and matched to the
   * source card carrying the same `citationIndex`. */
  index: number;
  title: string;
}

/**
 * Appends a `[N]` marker (rendered as a small clickable badge, see the `a`
 * override below) right after the FIRST literal occurrence of each
 * citation's title in the raw markdown text.
 *
 * Plain substring search (no regex) so titles with punctuation like
 * parentheses or hyphens can't break the match. Overlaps are resolved
 * against the ORIGINAL string's positions (longest titles claimed first,
 * shorter titles that would land inside an already-claimed span are
 * skipped) so e.g. "Kita" never gets its own marker inside a mention of
 * "Kita-Anmeldung". Insertions are then applied back-to-front so earlier
 * offsets stay valid. A title the model didn't mention verbatim (rare —
 * the system prompt requires citing documents by name) simply gets no
 * marker; nothing here can produce broken markdown.
 */
function insertCitationMarkers(content: string, citations: ChatCitation[]): string {
  if (citations.length === 0) return content;

  const sorted = [...citations].sort((a, b) => b.title.length - a.title.length);
  const claimed: Array<[number, number]> = [];
  const insertions: Array<{ at: number; index: number }> = [];

  for (const { index, title } of sorted) {
    const trimmed = title.trim();
    if (trimmed.length < 3) continue;
    const pos = content.indexOf(trimmed);
    if (pos === -1) continue;
    const end = pos + trimmed.length;
    const overlaps = claimed.some(([s, e]) => pos < e && end > s);
    if (overlaps) continue;
    claimed.push([pos, end]);
    insertions.push({ at: end, index });
  }

  if (insertions.length === 0) return content;
  insertions.sort((a, b) => b.at - a.at); // back-to-front so earlier offsets don't shift
  let result = content;
  for (const { at, index } of insertions) {
    result = `${result.slice(0, at)}[${index}](#cite-${index})${result.slice(at)}`;
  }
  return result;
}

/**
 * Markdown component overrides for chat answers.
 *
 * Ordilo's design system has no monospace/display-font accents, so code
 * blocks fall back to the body font. Tables use the sand/mist tokens
 * (`--muted`, `--border`) already used for cards elsewhere in the app —
 * no new colors are introduced.
 */
function buildComponents(onCitationClick?: (index: number) => void): Components {
  return {
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
    a: ({ children, href }) => {
      if (href?.startsWith("#cite-")) {
        const index = Number(href.slice("#cite-".length));
        return (
          <button
            type="button"
            onClick={() => onCitationClick?.(index)}
            className="mx-0.5 inline-flex size-4 translate-y-[-3px] items-center justify-center rounded-full bg-[var(--petrol)]/10 text-[10px] font-semibold leading-none text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/20 focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/50"
            data-testid={`citation-marker-${index}`}
            aria-label={`Quelle ${index} anzeigen`}
          >
            {index}
          </button>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--petrol)] underline underline-offset-2 hover:no-underline"
        >
          {children}
        </a>
      );
    },
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
}

/**
 * Renders assistant chat answers as formatted Markdown (bold, lists,
 * tables via GFM) instead of raw text with literal `**asterisks**`.
 *
 * Used exclusively for AI-generated content in the chat/search UI —
 * user messages remain plain text (VAL-CHAT-034 safety still applies,
 * since react-markdown escapes raw HTML by default).
 *
 * When `citations` is given, the first mention of each source's title
 * gets a small clickable "[N]" marker tying the answer text back to its
 * source card (see `onCitationClick`).
 */
export function ChatMarkdown({
  content,
  citations,
  onCitationClick,
}: {
  content: string;
  citations?: ChatCitation[];
  onCitationClick?: (index: number) => void;
}) {
  const withMarkers = citations?.length
    ? insertCitationMarkers(content, citations)
    : content;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={buildComponents(onCitationClick)}
    >
      {withMarkers}
    </ReactMarkdown>
  );
}
