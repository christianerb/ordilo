import OpenAI from "openai";
import {
  documentAnalysisSchema,
  documentAnalysisJsonSchema,
  type DocumentAnalysis,
  type FamilyContext,
} from "@/lib/schemas/extraction";
import { EXTRACTION_MODEL } from "@/lib/ai/models";
import {
  extractPartialPreview,
  repairPartialJson,
  type PartialAnalysisPreview,
} from "@/lib/ai/partial-json";

/**
 * OpenAI structured output extraction client.
 *
 * Calls OpenAI with `response_format: { type: "json_schema", strict: true }`
 * using the `document_analysis` schema. The response is validated against
 * the Zod schema before being returned to the caller.
 *
 * The OPENAI_API_KEY is read from server-only env and is never exposed
 * to the client.
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Error thrown when the extraction call fails (API error, timeout, or
 * schema validation failure).
 */
export class ExtractionError extends Error {
  /** Machine-readable error code for structured API responses. */
  readonly code: string;
  /** HTTP status from OpenAI (if applicable). */
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the OpenAI extraction call.
 *
 * The prompt includes:
 *   - The assistant's role (Ordilo, a private AI family assistant)
 *   - The family context (members, categories, knowledge nodes)
 *   - Extraction instructions (document type, title, summary, entities, tasks)
 *   - Language instruction (German for all text fields)
 *
 * The family context allows the model to:
 *   - Match person names to known family members (person_id)
 *   - Suggest consistent categories
 *   - Reference known organizations from the knowledge graph
 *
 * @param familyContext - The family's members, categories, and knowledge nodes.
 * @returns The system prompt string.
 */
export function buildSystemPrompt(familyContext: FamilyContext): string {
  const parts: string[] = [];

  // Role description.
  parts.push(
    "Du bist Ordilo, ein privater AI-Familienassistent. Du analysierst Dokumente für Familien und extrahierst strukturierte Informationen in deutscher Sprache.",
  );

  // Family context — members.
  if (familyContext.members.length > 0) {
    const memberList = familyContext.members
      .map((m) => `- ${m.name}${m.role ? ` (${m.role})` : ""} [ID: ${m.id}]`)
      .join("\n");
    parts.push(`\nFamilienmitglieder:\n${memberList}`);
    parts.push(
      "Wenn das Dokument eine Person erwähnt, versuche sie einem Familienmitglied zuzuordnen und setze die entsprechende person_id. Wenn keine Zuordnung möglich ist, setze person_id auf null.",
    );
  } else {
    parts.push("\nFamilienmitglieder: keine bekannt.");
  }

  // Family context — existing collections + categories. Collections come
  // first: a category that matches a collection name files the document
  // into that collection automatically.
  const knownCategories = [
    ...new Set([
      ...(familyContext.collections ?? []),
      ...familyContext.categories,
    ]),
  ];
  if (knownCategories.length > 0) {
    parts.push(`\nVorhandene Kategorien: ${knownCategories.join(", ")}`);
    parts.push(
      "Verwende bevorzugt EXAKT eine dieser Kategorien (gleiche Schreibweise), wenn sie passt. Nur wenn keine passt, schlage eine neue kurze Kategorie vor.",
    );
  }

  // Family context — knowledge nodes.
  if (familyContext.knowledgeNodes.length > 0) {
    const nodeList = familyContext.knowledgeNodes
      .map((n) => `- ${n.label} (Typ: ${n.type})`)
      .join("\n");
    parts.push(`\nBekannte Organisationen und Einrichtungen:\n${nodeList}`);
  }

  // Extraction instructions.
  parts.push(`
Aufgaben:
1. Bestimme den Dokumenttyp (invoice, letter, contract, medical, school, insurance, tax, other).
2. Erstelle einen kurzen, aussagekräftigen Titel.
3. Fasse den Inhalt in 1-3 Sätzen zusammen. Nenne DABEI KONKRETE Werte aus dem Dokument: Uhrzeiten, Daten, Betraege, Namen, Orte, Flugnummern, Verspätungen. Nicht nur "es gibt Zeiten" sondern "Abflug 19:25, Ankunft 20:55". Nicht nur "ein Betrag" sondern "45,30 EUR". Diese Details sind fuer die Suchfunktion entscheidend.
4. Identifiziere erwähnte Familienmitglieder und ordne sie zu.
5. Extrahiere Organisationen mit ihrem Typ (z.B. "Kita", "Arztpraxis", "Versicherung", "Behörde"). NUR echte Einrichtungen, Firmen, Vereine oder Behörden sind Organisationen. Privatpersonen (Absender, Erzieherinnen, Ansprechpartner, Organisatoren) NIEMALS als Organisation extrahieren — nenne sie stattdessen in der Zusammenfassung (z.B. "organisiert von Frau Schultze").
6. Extrahiere alle relevanten Daten UND UHRZEITEN (Fristen, Termine, Abflugzeiten, Ankunftszeiten, Zahlungsdaten, Geburtstage) mit Typ und Label. Auch Uhrzeiten wie "19:25" als Date mit Typ "time" und beschreibendem Label wie "Abflug geplant" extrahieren. Das Label muss die BEDEUTUNG des Datums beschreiben (z.B. "Zahlungsfrist", "Elternabend", "Gezahlt am") — NIEMALS generische Labels wie "Datum" oder "Termin". Jedes Datum nur EINMAL extrahieren, auch wenn es mehrfach im Dokument steht. WICHTIG: Alle Daten im ISO-Format YYYY-MM-DD angeben (z.B. "2026-07-17", nicht "17.07." oder "Montag"). Uhrzeiten als "HH:MM" angeben. Wenn ein Datum nicht eindeutig ist, null zurueckgeben.
7. Extrahiere Geldbeträge. Für JEDEN Betrag:
   - amount und currency (Währung als ISO-Code, z.B. "EUR").
   - kind: was der Betrag IST. "total" = Gesamt-/Rechnungsbetrag. "paid" = wurde bereits gezahlt. "outstanding" = noch offen/zu zahlen. "per_person" = Anteil pro Person/Kind. "recurring" = wiederkehrend (Monatsbeitrag, Abo). "other" = nichts davon passt.
   - value_date: bei kind "paid" das Datum, AN DEM gezahlt wurde; bei "outstanding" das Fälligkeitsdatum. ISO-Format YYYY-MM-DD. Wenn das Dokument dazu nichts sagt: null.
   - label: die konkrete Bezeichnung aus dem Dokument (z.B. "Empfohlener Beitrag pro Kind", "Monatsbeitrag Kita") — NIEMALS generisch "Betrag" oder "Summe".
   Jeden Betrag nur EINMAL extrahieren, auch wenn er mehrfach im Dokument steht. kind und value_date sind entscheidend: Familien fragen später "Wann habe ich was gezahlt?" und "Wie viel habe ich insgesamt bezahlt?" — das ist nur beantwortbar, wenn bei jedem Betrag steht, ob er gezahlt wurde und wann.
8. Identifiziere Aufgaben (To-dos) mit Frist und Priorität (low, medium, high). Fristen im ISO-Format YYYY-MM-DD angeben. Wenn die Frist kein konkretes Datum ist (z.B. "Montag", "nächste Woche"), setze due_date auf null.
9. Extrahiere eindeutige Identifikatoren als facts: Seriennummern (serial_number), Vertragsnummern (contract_number), Policennummern (policy_number), Kundennummern (customer_number), Rechnungsnummern (invoice_number), IBAN (iban), Kfz-Kennzeichen (license_plate), Mitgliedsnummern (member_id), Flugnummern (other), sonstige Kennungen (other). Übernimm den Wert EXAKT wie im Dokument (inkl. Bindestriche/Leerzeichen). Das Label beschreibt, wozu die Kennung gehört (z.B. "Seriennummer Waschmaschine", "Vertragsnummer Stromvertrag", "Flugnummer").
10. Schlage eine Kategorie vor.
11. Vergibe IMMER 2-5 passende Tags (Schlüsselwörter), die typische Suchanfragen abdecken. Beispiele: "Flug", "Reise", "Rechnung", "Strom", "Versicherung", "Arzt", "Kita", "Schule", "Steuer", "Verspätung", "Abflug", "Terminal".
12. Setze needs_user_review auf true, wenn du dir bei wichtigen Feldern unsicher bist.

Alle Textfelder müssen auf Deutsch sein. Antworte NUR im angegebenen JSON-Format.`);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

/**
 * Get the OpenAI client, configured with the API key from env.
 * Throws a typed error if the key is missing.
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ExtractionError(
      "OpenAI API key is not configured.",
      "OPENAI_NOT_CONFIGURED",
    );
  }
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Maps a raw OpenAI call failure to the typed `ExtractionError`. */
function toExtractionError(err: unknown): ExtractionError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? undefined;
    if (status === 401 || status === 403) {
      return new ExtractionError(
        "OpenAI: Authentifizierung fehlgeschlagen.",
        "OPENAI_AUTH_ERROR",
        status,
      );
    }
    if (status === 429) {
      return new ExtractionError(
        "OpenAI: Rate-Limit erreicht. Bitte später erneut versuchen.",
        "OPENAI_RATE_LIMITED",
        status,
      );
    }
    return new ExtractionError(
      `OpenAI: API-Fehler${err.message ? ` (${err.message})` : ""}.`,
      "OPENAI_API_ERROR",
      status,
    );
  }
  // Network error or unknown error.
  return new ExtractionError(
    "Netzwerkfehler beim Kontaktieren von OpenAI.",
    "OPENAI_NETWORK_ERROR",
  );
}

/** Parses and Zod-validates the final (complete) extraction JSON. */
function parseAndValidate(content: string): DocumentAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ExtractionError(
      "OpenAI: Antwort konnte nicht als JSON geparst werden.",
      "OPENAI_INVALID_JSON",
    );
  }

  const result = documentAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${issue.path.join(".")}: ${issue.message}`
      : "Unbekannter Validierungsfehler.";
    throw new ExtractionError(
      `OpenAI: Antwort entspricht nicht dem Schema (${detail}).`,
      "OPENAI_SCHEMA_VALIDATION_FAILED",
    );
  }

  return result.data;
}

/**
 * Run the LLM extraction on a document's OCR text.
 *
 * Calls OpenAI (see `EXTRACTION_MODEL`) with `response_format: json_schema`
 * (strict mode) using the `document_analysis` schema. The response is
 * validated against the Zod schema before being returned.
 *
 * When `onPartial` is given, the completion streams instead: raw content
 * deltas are accumulated and best-effort parsed (see `partial-json.ts`) so
 * the caller can show a live "still reviewing" preview. The preview is
 * never authoritative — the full response is still parsed and Zod-
 * validated in full once the stream ends, exactly as in the non-streaming
 * path.
 *
 * @param ocrMarkdown - The full OCR markdown text of the document.
 * @param familyContext - The family's members, categories, and knowledge nodes.
 * @param onPartial - Optional callback invoked with whatever fields have
 *        streamed in so far. Best-effort only; skipped ticks are fine.
 * @returns The validated document analysis.
 * @throws {ExtractionError} if the API call fails, times out, or the
 *         response fails Zod validation.
 */
export async function runExtraction(
  ocrMarkdown: string,
  familyContext: FamilyContext,
  onPartial?: (preview: PartialAnalysisPreview) => void,
): Promise<DocumentAnalysis> {
  const client = getOpenAIClient();
  const systemPrompt = buildSystemPrompt(familyContext);

  const responseFormat = {
    type: "json_schema" as const,
    json_schema: {
      name: "document_analysis",
      strict: true,
      schema: documentAnalysisJsonSchema as Record<string, unknown>,
    },
  };
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: ocrMarkdown },
  ];

  if (!onPartial) {
    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model: EXTRACTION_MODEL,
        messages,
        response_format: responseFormat,
      });
    } catch (err) {
      throw toExtractionError(err);
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ExtractionError(
        "OpenAI: Leere Antwort erhalten.",
        "OPENAI_EMPTY_RESPONSE",
      );
    }
    return parseAndValidate(content);
  }

  // --- Streaming path: same call, incrementally previewed. ---
  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await client.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages,
      response_format: responseFormat,
      stream: true,
    });
  } catch (err) {
    throw toExtractionError(err);
  }

  let buffer = "";
  let lastPreviewSize = 0;
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (!delta) continue;
      buffer += delta;

      const repaired = repairPartialJson(buffer);
      if (repaired === null) continue;
      const preview = extractPartialPreview(repaired);
      const size = JSON.stringify(preview).length;
      // Only notify when the preview actually grew — a repaired parse of
      // the same buffer position produces an identical object otherwise.
      if (size > lastPreviewSize) {
        lastPreviewSize = size;
        onPartial(preview);
      }
    }
  } catch (err) {
    throw toExtractionError(err);
  }

  if (!buffer) {
    throw new ExtractionError(
      "OpenAI: Leere Antwort erhalten.",
      "OPENAI_EMPTY_RESPONSE",
    );
  }
  return parseAndValidate(buffer);
}
