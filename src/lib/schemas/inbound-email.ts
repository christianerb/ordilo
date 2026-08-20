import { z } from "zod";

/**
 * What Ordilo may propose after reading a plain inbound email: a calendar
 * entry or a task. Nothing else — an email is not a document, so it never
 * enters the document pipeline from here.
 */
export const inboundSuggestionKindSchema = z.enum(["calendar_event", "task"]);

export type InboundSuggestionKind = z.infer<typeof inboundSuggestionKindSchema>;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoTime = /^\d{2}:\d{2}$/;

const nullableText = z
  .string()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  });

/** A single proposal as the model returns it. */
export const emailSuggestionSchema = z.object({
  kind: inboundSuggestionKindSchema,
  title: z.string().min(1).max(120),
  date: nullableText.refine((value) => value === null || isoDate.test(value), {
    message: "Datum muss YYYY-MM-DD sein.",
  }),
  start_time: nullableText.refine(
    (value) => value === null || isoTime.test(value),
    { message: "Uhrzeit muss HH:MM sein." },
  ),
  end_time: nullableText.refine(
    (value) => value === null || isoTime.test(value),
    { message: "Uhrzeit muss HH:MM sein." },
  ),
  location: nullableText,
  note: nullableText,
  confidence: z.number().min(0).max(1),
});

export type EmailSuggestion = z.infer<typeof emailSuggestionSchema>;

export const emailInsightsSchema = z.object({
  suggestions: z.array(emailSuggestionSchema),
});

export type EmailInsights = z.infer<typeof emailInsightsSchema>;

/**
 * Strict JSON schema for the OpenAI Responses API. Strict mode requires
 * every property to be listed in `required`, so optional values are typed
 * as nullable instead.
 */
export const emailInsightsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "title",
          "date",
          "start_time",
          "end_time",
          "location",
          "note",
          "confidence",
        ],
        properties: {
          kind: {
            type: "string",
            enum: ["calendar_event", "task"],
            description:
              "calendar_event für einen Termin mit Datum, task für eine Aufgabe oder Frist.",
          },
          title: {
            type: "string",
            description: "Kurzer, konkreter Titel auf Deutsch.",
          },
          date: {
            type: ["string", "null"],
            description: "Datum im Format YYYY-MM-DD, sonst null.",
          },
          start_time: {
            type: ["string", "null"],
            description: "Uhrzeit im Format HH:MM, sonst null.",
          },
          end_time: {
            type: ["string", "null"],
            description: "Endzeit im Format HH:MM, sonst null.",
          },
          location: {
            type: ["string", "null"],
            description: "Ort, wenn genannt, sonst null.",
          },
          note: {
            type: ["string", "null"],
            description: "Ein Satz mit dem, was die Familie mitnehmen muss.",
          },
          confidence: {
            type: "number",
            description: "0 bis 1 — wie sicher der Vorschlag ist.",
          },
        },
      },
    },
  },
} as const;

/** How many proposals a single email may produce. */
export const MAX_EMAIL_SUGGESTIONS = 3;

/**
 * A proposal below this confidence is dropped rather than shown. The point
 * of the feature is one calm, correct question — not a list of guesses.
 */
export const MIN_EMAIL_SUGGESTION_CONFIDENCE = 0.5;

/**
 * Validate a model response and keep only the proposals worth showing:
 * confident enough, and (for a calendar entry) actually dated. A single bad
 * item never discards the whole response.
 */
export function selectEmailSuggestions(raw: unknown): EmailSuggestion[] {
  const parsed = emailInsightsSchema.safeParse(raw);
  const candidates = parsed.success
    ? parsed.data.suggestions
    : parseLoosely(raw);

  return candidates
    .filter(
      (suggestion) =>
        suggestion.confidence >= MIN_EMAIL_SUGGESTION_CONFIDENCE &&
        (suggestion.kind !== "calendar_event" || suggestion.date !== null),
    )
    .slice(0, MAX_EMAIL_SUGGESTIONS);
}

/** Keeps the valid items when the model returns one malformed entry. */
function parseLoosely(raw: unknown): EmailSuggestion[] {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { suggestions?: unknown }).suggestions)
  ) {
    return [];
  }
  const items = (raw as { suggestions: unknown[] }).suggestions;
  const valid: EmailSuggestion[] = [];
  for (const item of items) {
    const result = emailSuggestionSchema.safeParse(item);
    if (result.success) valid.push(result.data);
  }
  return valid;
}
