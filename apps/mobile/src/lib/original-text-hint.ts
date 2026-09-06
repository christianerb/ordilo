export type OriginalTextMatch =
  | { kind: "match"; excerpt: string; clippedBefore: boolean; clippedAfter: boolean }
  | { kind: "ambiguous" }
  | { kind: "missing" };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchValues(value: string): string[] {
  const clean = value.trim().replace(/\s+/gu, " ");
  const values = [clean];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (iso) {
    const [, year, month, day] = iso;
    values.push(`${day}.${month}.${year}`, `${Number(day)}.${Number(month)}.${year}`);
  }
  return [...new Set(values)].filter(Boolean);
}

/**
 * Locate a unique whole value in OCR text, tolerating only case, whitespace
 * and the common German spelling of an ISO date. Return original characters,
 * never an invented quote, inferred page or rewritten paragraph.
 */
export function findOriginalTextMatch(text: string | null | undefined, value: string): OriginalTextMatch {
  if (!text || !value.trim()) return { kind: "missing" };
  const positions = new Map<number, number>();
  for (const candidate of searchValues(value)) {
    const expression = new RegExp(candidate.split(/\s+/u).map(escapeRegex).join("\\s+"), "giu");
    for (const match of text.matchAll(expression)) {
      const start = match.index;
      const end = start + match[0].length;
      // Don't call a substring of another name, identifier or amount a match.
      if (/[\p{L}\p{N}]/u.test(candidate[0]) && /[\p{L}\p{N}]/u.test(text[start - 1] ?? "")) continue;
      if (/[\p{L}\p{N}]/u.test(candidate.at(-1) ?? "") && /[\p{L}\p{N}]/u.test(text[end] ?? "")) continue;
      positions.set(start, end);
      if (positions.size > 1) return { kind: "ambiguous" };
    }
  }
  const found = [...positions.entries()][0];
  if (!found) return { kind: "missing" };
  const [matchStart, matchEnd] = found;
  // Prefer the containing paragraph; bound long OCR blocks around the value.
  const paragraphStart = text.lastIndexOf("\n\n", matchStart) + 2;
  const nextBreak = text.indexOf("\n\n", matchEnd);
  const paragraphEnd = nextBreak < 0 ? text.length : nextBreak;
  const start = Math.max(paragraphStart > 1 ? paragraphStart : 0, matchStart - 160);
  const end = Math.min(paragraphEnd, matchEnd + 160);
  return {
    kind: "match",
    excerpt: text.slice(start, end).trim(),
    clippedBefore: start > 0,
    clippedAfter: end < text.length,
  };
}
