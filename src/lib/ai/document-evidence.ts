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
  if (selected.length) return [...corrections, ...selected.map(({ row }) => ({
    documentId: doc.id, title: doc.title, page: row.page_number, hasOriginal: Boolean(doc.file_url),
    text: redactPII(selectEvidenceWindow(row.ocr_markdown!, query)),
  }))];
  // A legacy combined OCR field has no trustworthy page attribution.
  if (page !== undefined || !safeText(doc.ocr_text ?? "").trim()) return corrections;
  return [...corrections, { documentId: doc.id, title: doc.title, page: null, hasOriginal: Boolean(doc.file_url),
    text: redactPII(selectEvidenceWindow(safeText(doc.ocr_text!), query)) }];
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

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amountValue(raw: string): number {
  return Number(raw.replace(",", "."));
}

/** Currency amounts one passage shows within a field name's reach. The
 * "…" between joined passages means "not adjacent": an amount from a
 * different passage never counts as belonging to the field. */
function amountsAtField(passages: string[], field: string): string[] {
  const found: string[] = [];
  for (const passage of passages) {
    for (const occurrence of passage.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegex(field)}(?![\\p{L}])`, "giu"))) {
      const from = Math.max(0, occurrence.index! - 30);
      for (const amount of passage.slice(from, occurrence.index! + occurrence[0].length + 30).matchAll(CURRENCY_AMOUNT)) {
        found.push(amount[1]!);
      }
    }
  }
  return found;
}

/** The amounts the page itself puts in the field's row. A form pairs a
 * label with its value on one line, so the line — not a character window
 * — is the honest boundary for "these two belong together". */
function amountsOnPageRow(pageText: string, field: string): string[] {
  const atField = new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegex(field)}(?![\\p{L}])`, "iu");
  const found: string[] = [];
  for (const line of pageText.split(/\r?\n/)) {
    const row = comparableEvidence(line);
    if (!row || !atField.test(row)) continue;
    for (const amount of row.matchAll(CURRENCY_AMOUNT)) found.push(amount[1]!);
  }
  return found;
}

/**
 * A claim that assigns an amount to a named field ("44,10 € für die
 * Folgeabbuchungen") must not quote a page that pairs that same field with
 * a different amount. On a form the amount fields sit close together, and
 * a swapped pair passes every other check while saying the opposite of
 * what the page says. A field only counts with the amount the claim
 * itself places nearest to it, so a sentence listing several fields with
 * their amounts does not cross-match them. Only capitalized field names
 * the quote itself contains count; person names never do.
 *
 * Where the quote names the field but leaves its value in another passage,
 * the pairing is decided on the page, not in the quote: joining
 * "Vorabnutzung ab dem …" to a later "92,17 €" must not create a pairing
 * the form never made.
 */
export function amountFieldMismatch(
  claimText: string,
  quote: string,
  people: string[] = [],
  pageText = "",
): { field: string; claimed: string; shown: string } | null {
  const passages = quotePassages(quote).map(comparableEvidence);
  const claimAmounts = [...claimText.matchAll(CURRENCY_AMOUNT)];
  if (!claimAmounts.length) return null;
  for (const fieldMatch of claimText.matchAll(/\p{Lu}\p{Ll}{4,}/gu)) {
    const field = fieldMatch[0]!;
    if (people.some((person) => matchesPersonName(field, person))) continue;
    const atField = new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegex(field)}(?![\\p{L}])`, "iu");
    if (!passages.some((passage) => atField.test(passage))) continue;
    const quoted = amountsAtField(passages, field);
    const shown = quoted.length || !pageText
      ? quoted
      : amountsOnPageRow(pageText, field);
    if (!shown.length) continue;
    const start = fieldMatch.index!;
    const end = start + field.length;
    let claimed: string | null = null;
    let bestDistance = Infinity;
    for (const amount of claimAmounts) {
      const distance = amount.index! >= end
        ? amount.index! - end
        : start - (amount.index! + amount[0].length);
      if (distance < bestDistance) {
        bestDistance = distance;
        claimed = amount[1]!;
      }
    }
    if (claimed === null || bestDistance > 60) continue;
    if (shown.every((amount) => amountValue(amount) !== amountValue(claimed))) {
      return { field, claimed, shown: shown[0]! };
    }
  }
  return null;
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
  | { text: string; sources: ChatSource[]; state: "answered" | "partial" | "conflict" | "not_found"; gap?: string }
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
  const sources: ChatSource[] = [];
  for (const claim of parsed.data.claims) {
    // Markup-only quotes ("<br><br>") normalize to "" and would match any page.
    if (comparableEvidence(claim.quote).replace(/[^\p{L}\p{N}]/gu, "").length < 8) {
      return { error: "Zitiere eine zusammenhängende Originalstelle mit echtem Text aus der Unterlage." };
    }
    const passages = quotePassages(claim.quote);
    if (passages.length > MAX_QUOTE_PASSAGES) {
      return { error: `Ein Beleg darf aus höchstens ${MAX_QUOTE_PASSAGES} Stellen derselben Seite bestehen. Zitiere weniger, dafür zusammenhängende Ausschnitte.` };
    }
    const page = evidence.find((item) => item.documentId === claim.document_id && item.page === claim.page_number
      && pageCarriesQuote(item.text, passages));
    if (!page) return { error: "Die zitierte Stelle wurde so noch nicht gelesen. Lies die passende Seite mit read_document und übernimm das Zitat wörtlich. Bei einem Formular darfst du Feldbeschriftung und Wert mit '...' verbinden, solange beide wörtlich auf derselben Seite stehen." };
    for (const person of people) {
      if (matchesPersonName(claim.text, person) && !matchesPersonName(`${page.title ?? ""} ${page.text}`, person)) {
        return { error: "Die genannte Person gehört nicht zu dieser Fundstelle. Lies die Unterlage der richtigen Person." };
      }
    }
    if (validityDateConflict(claim.text, claim.quote)) return { error: "Die Ticketgültigkeit wurde mit einem anderen Datum verwechselt. Zitiere das Gültigkeitsende, nicht die Kündigungsfrist." };
    if (!numbersAreSupported(claim.text, claim.quote)) return { error: "Ein Datum oder eine Zahl der Aussage steht nicht in ihrem Beleg. Prüfe die Gültigkeit bzw. Frist auf der Originalseite und korrigiere die Aussage." };
    const mismatch = amountFieldMismatch(claim.text, claim.quote, people, page.text);
    if (mismatch) return { error: `Die Aussage nennt bei „${mismatch.field}“ den Betrag ${mismatch.claimed} €, der Beleg zeigt dort ${mismatch.shown} €. Übernimm Feldname und Betrag so, wie sie auf der Seite zusammenstehen.` };
    const normalizedHighlight = claim.highlight
      ? normalizeFactText(readableQuote(claim.highlight))
      : null;
    if (normalizedHighlight && (
      !normalizeFactText(readableQuote(claim.quote)).includes(normalizedHighlight)
      || !normalizeFactText(readableQuote(claim.text)).includes(normalizedHighlight)
    )) {
      return { error: "Die Hervorhebung muss sowohl in der Antwort als auch im Beleg stehen." };
    }
    // A form quote skips between fields; keep the skip visible to the family
    // instead of showing distant fields as one continuous passage.
    const shownQuote = readableQuote(passages.length > 1 ? passages.join(" … ") : claim.quote);
    sources.push({ document_id: page.documentId, title: page.title, excerpt: shownQuote,
      score: 1, origin: "semantic", page_number: page.page ?? undefined,
      quote: shownQuote, highlight: claim.highlight && readableQuote(claim.highlight), cited: true, has_original: page.hasOriginal });
  }
  const gap = parsed.data.gap;
  // Naming where the model looked ("Seite 1 und 2") is navigation, not a
  // fact; every other digit in a gap could smuggle an unproven number past
  // the claims check.
  const gapWithoutPageReferences = gap?.replace(
    /\b(?:seite|s\.)\s*\d+(?:\s*(?:und|bis|,|–|-)\s*\d+)*/giu, " ",
  );
  if (gapWithoutPageReferences && /\d/.test(gapWithoutPageReferences)) return { error: "In gap nur die fehlende Information benennen. Konkrete Zahlen gehören in belegte claims." };
  // Two registrations often warrant one identical sentence per page. The
  // family reads that sentence once; both page citations stay attached.
  const claimTexts = [...new Set(parsed.data.claims.map((claim) => claim.text))];
  return { text: claimTexts.join("\n\n") + (gap ? `${claimTexts.length ? "\n\n" : ""}${gap}` : ""),
    sources, state: parsed.data.state, gap: gap || undefined };
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
