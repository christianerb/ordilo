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

export function verifyDocumentAnswer(args: unknown, evidence: DocumentEvidence[], people: string[] = [], question = ""):
  | { text: string; sources: ChatSource[]; state: "answered" | "partial" | "conflict" | "not_found" }
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
    const page = evidence.find((item) => item.documentId === claim.document_id && item.page === claim.page_number
      && (normalizeEvidence(item.text).includes(normalizeEvidence(claim.quote))
        || comparableEvidence(item.text).includes(comparableEvidence(claim.quote))));
    if (!page) return { error: "Die zitierte Stelle wurde so noch nicht gelesen. Lies die passende Seite mit read_document und übernimm das Zitat wörtlich." };
    if (claim.quote.includes("[…]")) return { error: "Zitiere eine zusammenhängende Originalstelle, nicht mehrere zusammengefügte Ausschnitte." };
    for (const person of people) {
      if (matchesPersonName(claim.text, person) && !matchesPersonName(`${page.title ?? ""} ${page.text}`, person)) {
        return { error: "Die genannte Person gehört nicht zu dieser Fundstelle. Lies die Unterlage der richtigen Person." };
      }
    }
    if (validityDateConflict(claim.text, claim.quote)) return { error: "Die Ticketgültigkeit wurde mit einem anderen Datum verwechselt. Zitiere das Gültigkeitsende, nicht die Kündigungsfrist." };
    if (!numbersAreSupported(claim.text, claim.quote)) return { error: "Ein Datum oder eine Zahl der Aussage steht nicht in ihrem Beleg. Prüfe die Gültigkeit bzw. Frist auf der Originalseite und korrigiere die Aussage." };
    if (claim.highlight && (!normalizeFactText(claim.quote).includes(normalizeFactText(claim.highlight))
      || !normalizeFactText(claim.text).includes(normalizeFactText(claim.highlight)))) {
      return { error: "Die Hervorhebung muss sowohl in der Antwort als auch im Beleg stehen." };
    }
    const shownQuote = readableQuote(claim.quote);
    sources.push({ document_id: page.documentId, title: page.title, excerpt: shownQuote,
      score: 1, origin: "semantic", page_number: page.page ?? undefined,
      quote: shownQuote, highlight: claim.highlight && readableQuote(claim.highlight), cited: true, has_original: page.hasOriginal });
  }
  const gap = parsed.data.gap;
  if (gap && /\d/.test(gap)) return { error: "In gap nur die fehlende Information benennen. Konkrete Zahlen gehören in belegte claims." };
  return { text: parsed.data.claims.map((claim) => claim.text).join("\n\n") + (gap ? `${parsed.data.claims.length ? "\n\n" : ""}${gap}` : ""),
    sources, state: parsed.data.state };
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
