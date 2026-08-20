/**
 * An email body is read once by the model and never indexed, so a generous
 * but bounded slice is enough — the appointment is in the first screenful,
 * the quoted thread below it is not.
 */
export const EMAIL_BODY_MAX_CHARS = 8_000;

/** Blocks whose contents are markup plumbing rather than words. */
const NON_TEXT_BLOCKS = /<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * German mail templates write umlauts as named entities more often than not,
 * and "Mrz" instead of "März" is exactly the kind of noise that makes a model
 * misread a date line.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
  ndash: "–",
  mdash: "—",
  euro: "€",
  hellip: "…",
};

/** Decodes numeric and known named entities; anything else becomes a space. */
function decodeEntity(entity: string): string {
  const numeric = /^&#(x[0-9a-f]+|\d+);$/i.exec(entity);
  if (numeric) {
    const raw = numeric[1];
    const code = raw[0].toLowerCase() === "x"
      ? Number.parseInt(raw.slice(1), 16)
      : Number.parseInt(raw, 10);
    // fromCodePoint throws a RangeError above the Unicode ceiling, so a
    // malformed entity like &#x110000; must fall back before it gets there.
    return Number.isFinite(code) && code > 0 && code <= 0x10_ffff
      ? String.fromCodePoint(code)
      : " ";
  }
  const name = /^&([a-z]+);$/i.exec(entity)?.[1];
  return (name && NAMED_ENTITIES[name]) ?? " ";
}

/**
 * Turn an HTML mail part into readable plain text: block elements become
 * line breaks so a date and its label do not end up glued together.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(NON_TEXT_BLOCKS, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x?[0-9a-f]+;|&[a-z]+;/gi, decodeEntity)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * The readable body of a received email, preferring the plain-text part.
 * Returns null when there is nothing to read — a bare forwarded attachment
 * should not cost an LLM call.
 */
export function plainTextFromEmail(
  text: string | null | undefined,
  html: string | null | undefined,
): string | null {
  const plain = text?.trim();
  const body = plain && plain.length > 0 ? plain : html ? htmlToPlainText(html) : "";
  if (body.trim().length === 0) return null;
  return body.slice(0, EMAIL_BODY_MAX_CHARS);
}
