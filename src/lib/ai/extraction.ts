import OpenAI from "openai";
import {
  documentAnalysisSchema,
  documentAnalysisJsonSchema,
  type DocumentAnalysis,
  type FamilyContext,
} from "@/lib/schemas/extraction";

/**
 * OpenAI GPT-4.1 Mini structured output extraction client.
 *
 * Calls OpenAI with `response_format: { type: "json_schema", strict: true }`
 * using the `document_analysis` schema. The response is validated against
 * the Zod schema before being returned to the caller.
 *
 * The OPENAI_API_KEY is read from server-only env and is never exposed
 * to the client.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The OpenAI model used for extraction. */
const EXTRACTION_MODEL = "gpt-4.1-mini";

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

  // Family context — existing categories.
  if (familyContext.categories.length > 0) {
    parts.push(
      `\nVorhandene Kategorien: ${familyContext.categories.join(", ")}`,
    );
    parts.push(
      "Versuche, eine dieser Kategorien vorzuschlagen, wenn sie passt. Andernfalls schlage eine neue passende Kategorie vor.",
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
3. Fasse den Inhalt in 1-3 Sätzen zusammen.
4. Identifiziere erwähnte Familienmitglieder und ordne sie zu.
5. Extrahiere Organisationen mit ihrem Typ (z.B. "Kita", "Arztpraxis", "Versicherung", "Behörde").
6. Extrahiere alle relevanten Daten (Fristen, Termine, Zahlungsdaten) mit Typ und Label.
7. Extrahiere Geldbeträge mit Währung und Label.
8. Identifiziere Aufgaben (To-dos) mit Frist und Priorität (low, medium, high).
9. Schlage eine Kategorie vor.
10. Vergibe passende Tags (Schlüsselwörter).
11. Setze needs_user_review auf true, wenn du dir bei wichtigen Feldern unsicher bist.

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

/**
 * Run the LLM extraction on a document's OCR text.
 *
 * Calls OpenAI GPT-4.1 Mini with `response_format: json_schema` (strict
 * mode) using the `document_analysis` schema. The response is validated
 * against the Zod schema before being returned.
 *
 * @param ocrMarkdown - The full OCR markdown text of the document.
 * @param familyContext - The family's members, categories, and knowledge nodes.
 * @returns The validated document analysis.
 * @throws {ExtractionError} if the API call fails, times out, or the
 *         response fails Zod validation.
 */
export async function runExtraction(
  ocrMarkdown: string,
  familyContext: FamilyContext,
): Promise<DocumentAnalysis> {
  const client = getOpenAIClient();
  const systemPrompt = buildSystemPrompt(familyContext);

  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await client.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: ocrMarkdown },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_analysis",
          strict: true,
          schema: documentAnalysisJsonSchema as Record<string, unknown>,
        },
      },
    });
  } catch (err) {
    // Distinguish known OpenAI API errors from network errors.
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? undefined;
      if (status === 401 || status === 403) {
        throw new ExtractionError(
          "OpenAI: Authentifizierung fehlgeschlagen.",
          "OPENAI_AUTH_ERROR",
          status,
        );
      }
      if (status === 429) {
        throw new ExtractionError(
          "OpenAI: Rate-Limit erreicht. Bitte später erneut versuchen.",
          "OPENAI_RATE_LIMITED",
          status,
        );
      }
      throw new ExtractionError(
        `OpenAI: API-Fehler${err.message ? ` (${err.message})` : ""}.`,
        "OPENAI_API_ERROR",
        status,
      );
    }
    // Network error or unknown error.
    throw new ExtractionError(
      "Netzwerkfehler beim Kontaktieren von OpenAI.",
      "OPENAI_NETWORK_ERROR",
    );
  }

  // Extract the JSON content from the response.
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new ExtractionError(
      "OpenAI: Leere Antwort erhalten.",
      "OPENAI_EMPTY_RESPONSE",
    );
  }

  // Parse the JSON content.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ExtractionError(
      "OpenAI: Antwort konnte nicht als JSON geparst werden.",
      "OPENAI_INVALID_JSON",
    );
  }

  // Validate against the Zod schema.
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
