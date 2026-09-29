import { z } from "zod";
import { isTravelTicket } from "./document-type";
import type { ChatSource } from "@ordilo/chat-contract";
import { redactPII } from "./pii-redact";
import { matchesPersonName } from "@/lib/schemas/search";

type Client = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export interface DocumentEvidence {
  documentId: string;
  title: string | null;
  page: number | null;
  text: string;
  hasOriginal?: boolean;
}

export function normalizeEvidence(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("de-DE")
    .replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}

/** Quotes are checked against what the family reads, not the OCR markup:
 * the model may copy the Markdown page or its readable excerpt, and may
 * type a plain hyphen or straight quotes for the typographic ones. */
export function comparableEvidence(text: string): string {
  return normalizeEvidence(readableQuote(text)
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u201c\u201d\u201e\u00ab\u00bb]/g, "\"")
    .replace(/[\u2018\u2019\u201a\u2039\u203a]/g, "'"));
}

function comparableLink(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE")
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

/** `[label](destination "title")` with balanced parentheses in the
 * destination. Returns the index after the closing parenthesis. */
function parseMarkdownLink(text: string, start: number): { label: string; destination: string; end: number } | null {
  const labelEnd = text.indexOf("](", start);
  if (labelEnd < 0 || /[\n[]/.test(text.slice(start + 1, labelEnd))) return null;
  let index = labelEnd + 2;
  let depth = 0;
  const destinationStart = index;
  while (index < text.length && !/\s/.test(text[index])) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
    index += 1;
  }
  const destination = text.slice(destinationStart, index);
  const title = /^\s+(?:"[^"\n]*"|'[^'\n]*')\s*/.exec(text.slice(index));
  if (title) index += title[0].length;
  if (text[index] !== ")" || !destination) return null;
  return { label: text.slice(start + 1, labelEnd), destination, end: index + 1 };
}

/** The link text stays; the destination too, unless the label already is
 * the printed address. Private destinations must remain in the stored
 * excerpt, which later turns use to keep them out of public web search. */
function readableLinks(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("[", index);
    if (open < 0) break;
    const link = parseMarkdownLink(text, open);
    if (!link) {
      result += text.slice(index, open + 1);
      index = open + 1;
      continue;
    }
    const image = open > index && text[open - 1] === "!";
    result += text.slice(index, image ? open - 1 : open);
    const label = link.label.trim();
    result += !label || comparableLink(label) === comparableLink(link.destination)
      ? label || link.destination
      : `${label} (${link.destination})`;
    index = link.end;
  }
  return result + text.slice(index);
}

/**
 * OCR returns page text as Markdown, and verified quotes are copied from it
 * verbatim. Families read the quote as a passage of their letter, so the
 * markup (bold, links, headings, line-break tags) is removed for display.
 */
export function readableQuote(text: string): string {
  return readableLinks(text.replace(/<br\s*\/?>/gi, " "))
    .replace(/(^|[^*\p{L}\p{N}])\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*(?![*\p{L}\p{N}])/gu, "$1$2")
    .replace(/(^|[^\p{L}\p{N}_])__(?!\s)(.+?)__(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, "$1$2")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Keep passages, not one representative fact per document. */
export function selectEvidenceWindow(text: string, query: string, limit = 8_000): string {
  if (text.length <= limit) return text;
  const words = normalizeEvidence(query).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const sections = text.split(/\n\s*\n/);
  if (sections.length < 2) {
    const lower = normalizeEvidence(text);
    const match = words.map((word) => lower.indexOf(word)).find((index) => index >= 0) ?? 0;
    return text.slice(Math.max(0, match - 600), Math.max(0, match - 600) + limit);
  }
  const ranked = sections.map((section, index) => ({
    index,
    score: words.reduce((score, word) => score + Number(normalizeEvidence(section).includes(word)), 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set<number>();
  let size = 0;
  for (const { index } of ranked) {
    for (const candidate of [index, index - 1, index + 1]) {
      if (candidate < 0 || candidate >= sections.length || selected.has(candidate)) continue;
      if (size + sections[candidate].length > limit && selected.size > 0) continue;
      selected.add(candidate);
      size += sections[candidate].length;
    }
    if (size >= limit) break;
  }
  return [...selected].sort((a, b) => a - b).map((index) => sections[index]).join("\n\n[…]\n\n").slice(0, limit);
}

/** A misclassified travel ticket may expose only its strict validity line.
 * Keep arbitrary credential content out of the model, including adjacent lines.
 */
export function ticketValidityEvidence(title: string | null, text: string): string {
  if (!/\b(?:deutschlandticket|ticket|fahrkarte)\b/i.test(title ?? "")) return "";
  const date = "\\d{1,2}\\.\\d{1,2}\\.\\d{4}";
  const validity = new RegExp(`^gültig(?:keit)?\\s*(?::|vom|ab|bis)?\\s*${date}(?:\\s*(?:bis|–|-)\\s*${date})?\\.?$`, "i");
  return text.split("\n").filter((line) => validity.test(line.replace(/\*/g, "").trim())).join("\n");
}

/** Confirm the family and document before reading child rows. */
export async function readDocumentEvidence(
  client: Client, familyId: string, documentId: string, query: string, page?: number,
): Promise<DocumentEvidence[]> {
  const { data: doc, error } = await client.from("documents")
    .select("id, title, ocr_text, document_type, source, file_url, corrections_text")
    .eq("id", documentId).eq("family_id", familyId).eq("status", "confirmed").maybeSingle();
  if (error || !doc) return [];
  if (doc.document_type === "credentials" && !/\b(?:deutschlandticket|ticket|fahrkarte)\b/i.test(doc.title ?? "")) return [];
  const misclassifiedTravel = doc.source !== "manual" && isTravelTicket(doc.ocr_text ?? "");
  const safeText = (text: string) => doc.document_type === "credentials" && !misclassifiedTravel
    ? ticketValidityEvidence(doc.title, text) : text;
  // A hand-written note is often a title and a bare value ("Code
  // Stromzähler" / "8341"). The title is the family's own words (analysis
  // never rewrites it), and without it the value alone is too short to
  // quote, so the note could be found but never answered from.
  const noteTitle = doc.source === "manual" && doc.document_type !== "credentials" ? doc.title?.trim() ?? "" : "";
  const withNoteTitle = (text: string) => noteTitle && !normalizeEvidence(text).startsWith(normalizeEvidence(noteTitle))
    ? `${noteTitle}\n${text}` : text;
  let pagesQuery = client.from("document_pages").select("page_number, ocr_markdown")
    .eq("document_id", documentId).order("page_number", { ascending: true });
  if (page !== undefined) pagesQuery = pagesQuery.eq("page_number", page);
  const { data: pages, error: pagesError } = await pagesQuery.limit(100);
  if (pagesError) throw new Error("Die Dokumentseiten konnten nicht gelesen werden.");
  const correctionResult = doc.corrections_text && doc.document_type !== "credentials"
    ? await client.rpc("document_correction_evidence", { p_document_id: doc.id }) : null;
  if (correctionResult?.error) throw new Error("Die Familienkorrektur konnte nicht gelesen werden.");
  const corrections: DocumentEvidence[] = correctionResult?.data ? [{
    documentId: doc.id, title: `Familienkorrektur: ${doc.title ?? "Dokument"}`,
    page: null, hasOriginal: false,
    text: redactPII(selectEvidenceWindow(correctionResult.data, query)),
  }] : [];
  const words = normalizeEvidence(query).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const readable = (pages ?? []).map((row) => ({ ...row, ocr_markdown: safeText(row.ocr_markdown ?? "") })).filter((row) => row.ocr_markdown.trim());
  const selected = readable.map((row) => ({ row, score: words.reduce((score, word) =>
    score + Number(normalizeEvidence(row.ocr_markdown!).includes(word)), 0) }))
    .sort((a, b) => b.score - a.score || a.row.page_number - b.row.page_number).slice(0, 4);
  // The title is added after the window is chosen: a query word in the
  // title would otherwise pin a long note's window to its first lines.
  if (selected.length) return [...corrections, ...selected.map(({ row }) => {
    const window = selectEvidenceWindow(row.ocr_markdown!, query);
    return {
      documentId: doc.id, title: doc.title, page: row.page_number, hasOriginal: Boolean(doc.file_url),
      text: redactPII(row.page_number === 1 ? withNoteTitle(window) : window),
    };
  })];
  // A legacy combined OCR field has no trustworthy page attribution.
  if (page !== undefined || !safeText(doc.ocr_text ?? "").trim()) return corrections;
  return [...corrections, { documentId: doc.id, title: doc.title, page: null, hasOriginal: Boolean(doc.file_url),
    text: redactPII(withNoteTitle(selectEvidenceWindow(safeText(doc.ocr_text!), query))) }];
}

const months = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
export function normalizeFactText(text: string): string {
  return normalizeEvidence(text)
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, year, month, day) => `${Number(day)}.${Number(month)}.${year}`)
    .replace(/(\d{1,2})\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/g,
      (_, day, month, year) => `${Number(day)}.${months.indexOf(month) + 1}.${year}`)
    .replace(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/g, (_, day, month, year) => `${Number(day)}.${Number(month)}.${year}`);
}

/** A numeric claim must occur in its own evidence, not just somewhere in the results. */
export function numbersAreSupported(answer: string, quote: string): boolean {
  const facts = normalizeFactText(answer).match(/\d+(?:[.,:/-]\d+)*/g) ?? [];
  const evidence = new Set(normalizeFactText(quote).match(/\d+(?:[.,:/-]\d+)*/g) ?? []);
  return facts.every((fact) => evidence.has(fact));
}

const CURRENCY_AMOUNT = /(\d+(?:[.,]\d+)?)\s*(?:€|euros?\b)/giu;
const FACT_DATE = /(?<![\d.])(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))(?!\d)/gu;

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amountValue(raw: string): number {
  return Number(raw.replace(",", "."));
}

/** Dates compare as the family reads them: a leading zero is decoration,
 * "01.10.26" and "1.10.26" are the same day. */
function dateValue(raw: string): string {
  return raw.replace(/(^|[./-])0+(\d)/gu, "$1$2");
}

function fieldPattern(field: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegex(field)}(?![\\p{L}])`, flags);
}

/**
 * The one value a text pairs with this occurrence of a field. A form row
 * carries several values, and a window that accepts any of them lets the
 * neighbouring field's amount stand in for this one — the exact swap this
 * guard exists to catch. The form's own reading order decides: the value
 * after the label is the label's, and only when none follows may one
 * before it claim the field. The claim itself is prose, so there the
 * nearest value in either direction is the one it names.
 */
function nearestValue(
  text: string,
  values: RegExp,
  start: number,
  end: number,
  reach: number,
  direction: "any" | "after" = "any",
): string | null {
  let nearest: string | null = null;
  let bestDistance = Infinity;
  for (const match of text.matchAll(values)) {
    const from = match.index!;
    if (direction === "after" && from < end) continue;
    const distance = from >= end ? from - end : start - (from + match[0].length);
    if (distance < 0 || distance > reach || distance >= bestDistance) continue;
    bestDistance = distance;
    nearest = match[1]!;
  }
  return nearest;
}

/** The value each quoted passage shows at the field. The "…" between
 * joined passages means "not adjacent": a value from a different passage
 * never counts as belonging to the field. */
function valuesAtField(passages: string[], field: string, values: RegExp, reach = 30): string[] {
  const found: string[] = [];
  for (const passage of passages) {
    for (const occurrence of passage.matchAll(fieldPattern(field, "giu"))) {
      const fieldStart = occurrence.index!;
      const fieldEnd = fieldStart + occurrence[0].length;
      const value = nearestValue(passage, values, fieldStart, fieldEnd, reach, "after")
        ?? nearestValue(passage, values, fieldStart, fieldEnd, reach);
      if (value) found.push(value);
    }
  }
  return found;
}

/** The page's own rows. A form pairs a label with its value on one line,
 * so the line — not a character window — is the honest boundary for
 * "these two belong together". */
function pageRows(pageText: string, prepare: (text: string) => string): string[] {
  return pageText.split(/\r?\n/).map(prepare).filter(Boolean);
}

/** Capitalized words that could name a form field. A person is never one. */
function claimFields(claimText: string, people: string[]): string[] {
  return [...new Set([...claimText.matchAll(/\p{Lu}\p{Ll}{4,}/gu)].map((match) => match[0]!))]
    .filter((field) => !people.some((person) => matchesPersonName(field, person)));
}

type Span = { text: string; start: number; end: number };

function spans(text: string, pattern: RegExp): Span[] {
  return [...text.matchAll(pattern)].map((match) => ({
    text: match[1] ?? match[0]!,
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}

/** Characters between two spans, 0 where they touch. */
function between(left: Span, right: Span): number {
  if (right.start >= left.end) return right.start - left.end;
  if (left.start >= right.end) return left.start - right.end;
  return 0;
}

function closest<T extends Span>(candidates: T[], target: Span, reach: number): T | null {
  let nearest: T | null = null;
  let shortest = Infinity;
  for (const candidate of candidates) {
    const distance = between(candidate, target);
    if (distance > reach || distance >= shortest) continue;
    shortest = distance;
    nearest = candidate;
  }
  return nearest;
}

/**
 * What the claim itself pairs with each field. Proximity alone reads a
 * sentence backwards: "Der Vertrag endet am 31.12.2027. Die Kündigung
 * ging am 05.08.2027 ein" puts the first date six characters from
 * "Kündigung" and its own date eight. So a label and a value belong
 * together only within one sentence, and only when each is the other's
 * nearest — a value the neighbouring label owns is not this label's.
 */
function claimedValues(claim: string, fields: string[], values: RegExp, reach: number): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const sentence of claim.split(/(?<=[.!?])\s+|\n+/u)) {
    const labels = fields.flatMap((field) =>
      spans(sentence, fieldPattern(field, "giu")).map((span) => ({ ...span, field })));
    const found = spans(sentence, values);
    for (const label of labels) {
      const value = closest(found, label, reach);
      if (!value || closest(labels, value, reach) !== label) continue;
      if (!pairs.has(label.field)) pairs.set(label.field, value.text);
    }
  }
  return pairs;
}

/**
 * A claim pairs a named field with a value; the evidence has to show that
 * same pair. Only fields the evidence itself names take part — a word the
 * page never uses must not win the pairing away from the field it does.
 * The page's own rows then decide, and the quote testifies only where the
 * rows cannot: when the row keeps its value on the next line, or when no
 * page text was given at all. A joined quote must not create a pairing
 * the page never made.
 */
function fieldValueMismatch(
  claim: string,
  passages: string[],
  rows: string[],
  fields: string[],
  values: RegExp,
  same: (left: string, right: string) => boolean,
): { field: string; claimed: string; shown: string } | null {
  const named = fields.filter((field) =>
    passages.some((passage) => fieldPattern(field, "iu").test(passage)));
  for (const [field, claimed] of claimedValues(claim, named, values, 60)) {
    const bound = rows.length
      ? rows.flatMap((row) => valuesAtField([row], field, values, row.length))
      : [];
    const shown = bound.length ? bound : valuesAtField(passages, field, values);
    if (!shown.length) continue;
    if (shown.every((value) => !same(value, claimed))) {
      return { field, claimed, shown: shown[0]! };
    }
  }
  return null;
}

/**
 * A claim that assigns an amount to a named field ("44,10 € für die
 * Folgeabbuchungen") must not quote a page that pairs that same field with
 * a different amount. On a form the amount fields sit close together, and
 * a swapped pair passes every other check while saying the opposite of
 * what the page says.
 */
export function amountFieldMismatch(
  claimText: string,
  quote: string,
  people: string[] = [],
  pageText = "",
): { field: string; claimed: string; shown: string } | null {
  const fields = claimFields(claimText, people);
  if (!fields.length) return null;
  return fieldValueMismatch(
    // "am 31. Dezember" would otherwise look like the end of a sentence
    // and cut a label away from the amount that belongs to it.
    normalizeFactText(claimText),
    quotePassages(quote).map(comparableEvidence),
    pageText ? pageRows(pageText, comparableEvidence) : [],
    fields,
    CURRENCY_AMOUNT,
    (left, right) => amountValue(left) === amountValue(right),
  );
}

/**
 * The same rule for dates, and only for a quote assembled from several
 * passages. A page that labels two dates ("Kündigungsfrist 31.07.2027",
 * "Gültigkeitsende 31.08.2027") reads unambiguously in its own order; a
 * joined quote can put either label next to either date, and nothing else
 * in the chain would notice, because both dates do stand on that page.
 * A contiguous passage needs no such proof — it is the page's own order.
 */
export function dateFieldMismatch(
  claimText: string,
  quote: string,
  people: string[] = [],
  pageText = "",
): { field: string; claimed: string; shown: string } | null {
  const passages = quotePassages(quote);
  if (passages.length < 2) return null;
  const fields = claimFields(claimText, people);
  if (!fields.length) return null;
  return fieldValueMismatch(
    normalizeFactText(claimText),
    passages.map(normalizeFactText),
    pageText ? pageRows(pageText, normalizeFactText) : [],
    fields,
    FACT_DATE,
    (left, right) => dateValue(left) === dateValue(right),
  );
}

export const documentAnswerSchema = z.object({
  claims: z.array(z.object({
    text: z.string().trim().min(1).max(700),
    document_id: z.string().uuid(),
    page_number: z.number().int().positive().nullable(),
    quote: z.string().trim().min(8).max(1_600),
    highlight: z.string().trim().min(1).max(100).optional(),
  })).min(0).max(5),
  state: z.enum(["answered", "partial", "conflict", "not_found"]),
  gap: z.string().trim().max(350).optional(),
});
export type DocumentAnswerClaim = z.infer<typeof documentAnswerSchema>["claims"][number];

/**
 * How many passages one quote may be assembled from. A form chains the
 * name to the base amount, the discount and the result — five or six
 * fields; more than this stops being a quotation and starts being a
 * sentence built out of scattered words.
 */
const MAX_QUOTE_PASSAGES = 6;

/** An explicit gap in a quotation: "…", "...", "[…]", or a blank line. */
const QUOTE_GAP = /\s*(?:\[\s*(?:…|\.\.\.)\s*\]|…|\.\.\.)\s*|\n\s*\n/u;

/**
 * A form spreads one fact across fields that are far apart: the name at the
 * top of the page, the amount thirty lines below. Such a fact cannot be
 * proven by a single contiguous passage, so a quote may skip — but every
 * passage it does contain must still stand verbatim on that one page, in
 * the order quoted.
 */
export function quotePassages(quote: string): string[] {
  return quote
    .split(QUOTE_GAP)
    .map((passage) => passage.trim())
    .filter(
      (passage) =>
        comparableEvidence(passage).replace(/[^\p{L}\p{N}]/gu, "").length > 0,
    );
}

/** Every passage present on the page, in the order the quote gives them. */
export function pageCarriesQuote(pageText: string, passages: string[]): boolean {
  if (!passages.length) return false;
  return [normalizeEvidence, comparableEvidence].some((normalize) => {
    const page = normalize(pageText);
    let cursor = 0;
    return passages.every((passage) => {
      const needle = normalize(passage);
      if (!needle) return false;
      const found = page.indexOf(needle, cursor);
      if (found < 0) return false;
      cursor = found + needle.length;
      return true;
    });
  });
}

export function verifyDocumentAnswer(args: unknown, evidence: DocumentEvidence[], people: string[] = [], question = ""):
  | { text: string; sources: ChatSource[]; state: "answered" | "partial" | "conflict" | "not_found"; gap?: string; unverified_claims?: string[] }
  | { error: string } {
  const parsed = documentAnswerSchema.safeParse(args);
  if (!parsed.success) return { error: "Nutze claims mit Text, document_id, page_number und wörtlichem Zitat, sowie state." };
  if (!parsed.data.claims.length && (parsed.data.state === "answered" || !parsed.data.gap)) return { error: "Eine beantwortete Frage braucht einen Beleg; ohne Beleg beschreibe die konkrete Lücke in gap." };
  if (parsed.data.state === "conflict" && parsed.data.claims.length < 2) return { error: "Ein Widerspruch braucht beide belegten Angaben." };
  const temporalQuestion = /\bwann\b|um welche uhrzeit/iu.test(question);
  const clock = /\b\d{1,2}:\d{2}\b/u;
  if (parsed.data.state === "answered" && temporalQuestion
    && parsed.data.claims.some(claim => clock.test(claim.quote))
    && !parsed.data.claims.some(claim => clock.test(claim.text) || /\b\d{1,2}\s*Uhr\b/u.test(claim.text) || /\b\d{1,2}\.\d{1,2}\.\d{4}\b/u.test(normalizeFactText(claim.text)))) {
    return { error: "Die Frage fragt nach der Zeit. Nenne die passende Uhrzeit aus dem Beleg; ein Ort allein beantwortet sie nicht." };
  }
  // One unverifiable claim must not discard the verified ones: a multi-part
  // question (several documents, a second child's unreadable slip) keeps its
  // verified parts and reports only the failing claims for correction.
  const claimProblem = (claim: DocumentAnswerClaim): string | null => {
    // Markup-only quotes ("<br><br>") normalize to "" and would match any page.
    if (comparableEvidence(claim.quote).replace(/[^\p{L}\p{N}]/gu, "").length < 8) {
      return "Zitiere eine zusammenhängende Originalstelle mit echtem Text aus der Unterlage.";
    }
    const passages = quotePassages(claim.quote);
    if (passages.length > MAX_QUOTE_PASSAGES) {
      return `Ein Beleg darf aus höchstens ${MAX_QUOTE_PASSAGES} Stellen derselben Seite bestehen. Zitiere weniger, dafür zusammenhängende Ausschnitte.`;
    }
    const page = evidence.find((item) => item.documentId === claim.document_id && item.page === claim.page_number
      && pageCarriesQuote(item.text, passages));
    if (!page) return "Die zitierte Stelle wurde so noch nicht gelesen. Lies die passende Seite mit read_document und übernimm das Zitat wörtlich. Bei einem Formular darfst du Feldbeschriftung und Wert mit '...' verbinden, solange beide wörtlich auf derselben Seite stehen.";
    // A source without a page number is one aggregate text: joining
    // passages across it could pair a person or an amount from one letter
    // with the words of another. Only a real page may be quoted in parts.
    if (page.page === null && passages.length > 1) {
      return "Für diese Fundstelle liegen keine Seitenzahlen vor. Zitiere eine einzelne zusammenhängende Stelle statt mehrerer Stellen.";
    }
    for (const person of people) {
      if (matchesPersonName(claim.text, person) && !matchesPersonName(`${page.title ?? ""} ${page.text}`, person)) {
        return "Die genannte Person gehört nicht zu dieser Fundstelle. Lies die Unterlage der richtigen Person.";
      }
    }
    if (validityDateConflict(claim.text, claim.quote)) return "Die Ticketgültigkeit wurde mit einem anderen Datum verwechselt. Zitiere das Gültigkeitsende, nicht die Kündigungsfrist.";
    if (!numbersAreSupported(claim.text, claim.quote)) return "Ein Datum oder eine Zahl der Aussage steht nicht in ihrem Beleg. Prüfe die Gültigkeit bzw. Frist auf der Originalseite und korrigiere die Aussage.";
    const mismatch = amountFieldMismatch(claim.text, claim.quote, people, page.text);
    if (mismatch) return `Die Aussage nennt bei „${mismatch.field}“ den Betrag ${mismatch.claimed} €, der Beleg zeigt dort ${mismatch.shown} €. Übernimm Feldname und Betrag so, wie sie auf der Seite zusammenstehen.`;
    const wrongDate = dateFieldMismatch(claim.text, claim.quote, people, page.text);
    if (wrongDate) return `Die Aussage nennt bei „${wrongDate.field}“ das Datum ${wrongDate.claimed}, der Beleg zeigt dort ${wrongDate.shown}. Übernimm Beschriftung und Datum so, wie sie auf der Seite zusammenstehen.`;
    const normalizedHighlight = claim.highlight
      ? normalizeFactText(readableQuote(claim.highlight))
      : null;
    if (normalizedHighlight && (
      !normalizeFactText(readableQuote(claim.quote)).includes(normalizedHighlight)
      || !normalizeFactText(readableQuote(claim.text)).includes(normalizedHighlight)
    )) {
      return "Die Hervorhebung muss sowohl in der Antwort als auch im Beleg stehen.";
    }
    return null;
  };
  const sources: ChatSource[] = [];
  const verifiedTexts: string[] = [];
  const problems: string[] = [];
  for (const claim of parsed.data.claims) {
    const problem = claimProblem(claim);
    if (problem) { problems.push(problem); continue; }
    verifiedTexts.push(claim.text);
    const passages = quotePassages(claim.quote);
    const page = evidence.find((item) => item.documentId === claim.document_id && item.page === claim.page_number
      && pageCarriesQuote(item.text, passages))!;
    // A form quote skips between fields; keep the skip visible to the family
    // instead of showing distant fields as one continuous passage.
    const shownQuote = readableQuote(passages.length > 1 ? passages.join(" … ") : claim.quote);
    sources.push({ document_id: page.documentId, title: page.title, excerpt: shownQuote,
      score: 1, origin: "semantic", page_number: page.page ?? undefined,
      quote: shownQuote, highlight: claim.highlight && readableQuote(claim.highlight), cited: true, has_original: page.hasOriginal });
  }
  // An empty-claims answer with a named gap is the honest not-found path;
  // only claims that failed verification justify an error return.
  if (parsed.data.claims.length && !verifiedTexts.length) return { error: problems[0] ?? "Jede Aussage braucht einen Beleg aus einer gelesenen Seite." };
  const gap = parsed.data.gap;
  // Naming where the model looked ("Seite 1 und 2") is navigation, not a
  // fact; every other digit in a gap could smuggle an unproven number past
  // the claims check. The grammar stays narrow on purpose: a comma or a
  // spaced dash does not continue a page reference, so "Auf Seite 1, 500
  // Euro" keeps the number the guard has to see.
  const gapWithoutPageReferences = gap?.replace(
    /\b(?:seiten?|s\.)\s*\d{1,4}(?!\d)(?:(?:\s*(?:und|bis)\s*\d{1,3}|\s*[-–]\s*\d{1,2}|[-–]\d{1,3})(?!\d))*/giu, " ",
  );
  if (gapWithoutPageReferences && /\d/.test(gapWithoutPageReferences)) return { error: "In gap nur die fehlende Information benennen. Konkrete Zahlen gehören in belegte claims." };
  // Two registrations often warrant one identical sentence per page. The
  // family reads that sentence once; both page citations stay attached.
  const claimTexts = [...new Set(verifiedTexts)];
  const text = claimTexts.join("\n\n") + (gap ? `${claimTexts.length ? "\n\n" : ""}${gap}` : "");
  if (!problems.length) return { text, sources, state: parsed.data.state, gap: gap || undefined };
  // Unverified claims remain open parts of the question: the honest state is
  // partial (or conflict, when the contradiction itself is verified twice).
  const state = parsed.data.state === "conflict" && verifiedTexts.length >= 2 ? "conflict" : "partial";
  return { text, sources, state, gap: gap || undefined, unverified_claims: problems };
}

/** Distinguish the common, high-risk validity/cancellation pair within one quote. */
export function validityDateConflict(answer: string, quote: string): boolean {
  const text = normalizeFactText(answer);
  const evidence = normalizeFactText(quote);
  if (!/(gültig|gilt\b|gültigkeit)/.test(text)) return false;
  const dates = text.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g) ?? [];
  if (!dates.length) return false;
  const labelled = [...evidence.matchAll(/(?:gültig(?:keitsende|keit)?|gilt)[^.!?\n]{0,50}?(\d{1,2}\.\d{1,2}\.\d{4})(?:\s*(?:bis|–|-)\s*(\d{1,2}\.\d{1,2}\.\d{4}))?/g)].flatMap((match) => match[2] && dates.length === 1 && /bis|endet|ablauf|läuft.*ab/.test(text) ? [match[2]] : [match[1], match[2]].filter(Boolean));
  if (labelled.length) return dates.some((date) => !labelled.includes(date));
  return /kündig/.test(evidence) && !/gültig|gilt\b/.test(evidence);
}
