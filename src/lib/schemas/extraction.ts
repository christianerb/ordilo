import { z } from "zod";
import {
  FileSignature,
  FileText,
  GraduationCap,
  Landmark,
  Mail,
  Receipt,
  Shield,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { ApiErrorResponse } from "@/lib/schemas/api";
import { matchesWordBoundary } from "@/lib/schemas/search";

/**
 * Zod schema and JSON schema for the LLM document analysis extraction.
 *
 * This module defines:
 *   - The Zod schema used to validate the OpenAI structured output response
 *   - The JSON schema sent to OpenAI Responses API with `text.format` (strict mode)
 *   - The confidence threshold for `needs_user_review`
 *   - Response types for the analyze API route
 *
 * The extraction schema mirrors the PRD section 6 document_analysis schema:
 *   document_type, title, summary, family_members, organizations, dates,
 *   amounts, tasks, suggested_category, tags, needs_user_review.
 */

// ---------------------------------------------------------------------------
// Document type enum
// ---------------------------------------------------------------------------

/**
 * All possible document types the LLM can classify a document as.
 * Constrained to this enum in both the Zod schema and the OpenAI JSON schema.
 */
export const DOCUMENT_TYPES = [
  "invoice",
  "letter",
  "contract",
  "medical",
  "school",
  "insurance",
  "tax",
  "note",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * German labels for each document type, used in the Review Card UI.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: "Rechnung",
  letter: "Brief",
  contract: "Vertrag",
  medical: "Arztbrief",
  school: "Schule",
  insurance: "Versicherung",
  tax: "Steuer",
  note: "Notiz",
  other: "Sonstiges",
};

// ---------------------------------------------------------------------------
// Fact types
// ---------------------------------------------------------------------------

/**
 * Typed identifiers the LLM extracts as document facts.
 *
 * Facts are exact key-value pairs (serial numbers, contract numbers, ...)
 * that must be retrievable verbatim — embeddings are unreliable for them,
 * so they are stored in `document_facts` and matched lexically.
 */
/**
 * The single fact type.
 *
 * Facts used to carry a type enum (serial_number, policy_number, iban, …),
 * which turned out to be the wrong axis: German paperwork produces an
 * endless tail of numbers — Steuer-ID, Versichertennummer, Zählernummer,
 * Aktenzeichen, Bestellnummer — and every new one either needed a code
 * change or fell into a nameless "other" bucket. What tells two numbers
 * apart is their LABEL ("Steuer-ID Hanna", "Zählernummer Keller"), and the
 * label is free text that anyone can write and correct.
 *
 * So there is one type, and the label carries the meaning. The column
 * stays in the database (legacy rows still hold their old value) but
 * nothing reads it for behaviour any more.
 */
export const IDENTIFIER_FACT_TYPE = "identifier";

/** Fallback label for a fact nobody has named yet. */
export const DEFAULT_FACT_LABEL = "Nummer";

/**
 * Groups of words that mean the same number to a family.
 *
 * Facts are matched by label, and labels are written by people and by the
 * extraction — "Policennummer" in the document, "Versicherungsnummer" in
 * the question. Each group is one meaning: if a question uses any word of
 * a group, all words of that group are searched for in the labels.
 *
 * The Steuer group is deliberately one group, not two: the 11-stellige
 * steuerliche Identifikationsnummer and the Steuernummer des Finanzamts
 * are different numbers that everyday language uses interchangeably.
 *
 * This is a recall aid, not a taxonomy — an unlisted number ("Zählernummer
 * Keller") is found by its own label without appearing here.
 */
export const IDENTIFIER_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  [
    "steuer-id",
    "steuerid",
    "steuernummer",
    "steuer-nr",
    "steuernr",
    "steueridentifikationsnummer",
    "steuerliche identifikationsnummer",
    "identifikationsnummer",
    "idnr",
    "id-nr",
    "tin",
    "finanzamtsnummer",
  ],
  [
    "policennummer",
    "policennr",
    "police",
    "versicherungsnummer",
    "versicherungsschein",
    "versicherungsscheinnummer",
  ],
  [
    "versichertennummer",
    "versichertennr",
    "krankenversicherungsnummer",
    "krankenkassennummer",
    "kvnr",
  ],
  ["iban", "kontonummer", "bankverbindung", "kontodaten"],
  ["kundennummer", "kundennr", "kunden-nr", "kundenkonto", "kundenkennung"],
  [
    "vertragsnummer",
    "vertragsnr",
    "vertrags-nr",
    "vertragskonto",
    "vertragskontonummer",
  ],
  ["rechnungsnummer", "rechnungsnr", "rechnungs-nr", "belegnummer"],
  [
    "seriennummer",
    "seriennr",
    "serien-nr",
    "gerätenummer",
    "geraetenummer",
    "imei",
  ],
  ["kennzeichen", "kfz-kennzeichen", "autokennzeichen", "nummernschild"],
  ["mitgliedsnummer", "mitgliedsnr", "mitglieds-nr", "mitgliedernummer"],
  ["zählernummer", "zaehlernummer", "zählerstand", "zählerid"],
  ["aktenzeichen", "geschäftszeichen", "geschaeftszeichen", "vorgangsnummer"],
];

/**
 * Normalize a fact value for exact lookup: lowercase and strip everything
 * that is not a letter or digit, so "SN 4823-XK" and "sn4823xk" match.
 */
export function normalizeFactValue(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Expand a question into the label terms worth searching for.
 *
 * Every word of every synonym group the question touches, so "Wie ist die
 * Steuernummer von Hanna?" also looks for labels containing "Steuer-ID"
 * or "IdNr". Returns [] when the question is not about a specific kind of
 * number — the plain query keywords still do their work then.
 */
export function expandIdentifierTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const group of IDENTIFIER_SYNONYM_GROUPS) {
    if (group.some((word) => matchesWordBoundary(query, word))) {
      for (const word of group) terms.add(word);
    }
  }
  return [...terms];
}

/**
 * Whether a question asks for a stored number at all — used for coarse
 * query classification, not for retrieval.
 */
export function asksForIdentifier(query: string): boolean {
  return IDENTIFIER_SYNONYM_GROUPS.some((group) =>
    group.some((word) => matchesWordBoundary(query, word)),
  );
}

// ---------------------------------------------------------------------------
// Confidence threshold
// ---------------------------------------------------------------------------

/**
 * Confidence threshold below which an entity or task is considered "low
 * confidence" and triggers `needs_user_review = true`.
 *
 * Entities/tasks with confidence < this value are flagged for user review.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Zod schema (for validating the OpenAI response)
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single extracted family member reference.
 * `person_id` is nullable — null when the LLM cannot match the person to
 * a known family member.
 */
const familyMemberSchema = z.object({
  person_id: z.string().nullable(),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

/**
 * Zod schema for a single extracted organization.
 */
const organizationSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Zod schema for a single extracted date.
 */
const dateSchema = z.object({
  date: z.string(),
  type: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * What an amount IS. Families ask "wann habe ich was gezahlt?", which is
 * unanswerable from a bare number: 88,00 EUR as the total of a collection
 * and 10,00 EUR already contributed have to be told apart, and the payment
 * date has to hang off the amount rather than sit in the parallel `dates`
 * array where only a matching label string would connect them.
 */
export const AMOUNT_KINDS = [
  "total",
  "paid",
  "outstanding",
  "per_person",
  "recurring",
  "other",
] as const;

export type AmountKind = (typeof AMOUNT_KINDS)[number];

/** German labels for the amount kinds. */
export const AMOUNT_KIND_LABELS: Record<AmountKind, string> = {
  total: "Gesamtbetrag",
  paid: "Bereits gezahlt",
  outstanding: "Noch offen",
  per_person: "Pro Person",
  recurring: "Wiederkehrend",
  other: "Betrag",
};

/**
 * Zod schema for a single extracted amount.
 *
 * `kind` and `value_date` have defaults so analyses stored before they
 * existed still validate when a client reconstructs a confirm payload.
 */
const amountSchema = z.object({
  amount: z.string(),
  currency: z.string(),
  label: z.string(),
  kind: z.enum(AMOUNT_KINDS).default("other"),
  /**
   * ISO date this amount was paid (kind "paid") or is due (kind
   * "outstanding"), when the document says so. Null otherwise.
   */
  value_date: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
});

/**
 * Zod schema for a single extracted task.
 * `due_date` is nullable — null when the task has no deadline.
 */
const taskSchema = z.object({
  title: z.string().min(1),
  due_date: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

/**
 * Zod schema for a single extracted fact (an identifier).
 *
 * `fact_type` is not part of the extraction any more — it defaults to
 * `identifier`. It stays a plain string rather than a literal so rows
 * written before the type collapse still parse when a confirmed document
 * is reconstructed from the database.
 */
const factSchema = z.object({
  fact_type: z.string().default(IDENTIFIER_FACT_TYPE),
  label: z.string().min(1),
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type ExtractedFact = z.infer<typeof factSchema>;

/**
 * The full document analysis Zod schema.
 *
 * This validates the OpenAI structured output response. All fields are
 * required (matching the strict-mode JSON schema). The `document_type`
 * is constrained to the enum. The top-level object is strict (`.strict()`)
 * so extra/unknown top-level keys cause validation to fail, matching the
 * OpenAI strict json_schema request (`additionalProperties: false`).
 */
export const documentAnalysisSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  title: z.string(),
  summary: z.string(),
  family_members: z.array(familyMemberSchema),
  organizations: z.array(organizationSchema),
  dates: z.array(dateSchema),
  amounts: z.array(amountSchema),
  tasks: z.array(taskSchema),
  // `facts` has a default so payloads reconstructed by older clients
  // (Review Card state persisted before the field existed) still validate.
  facts: z.array(factSchema).default([]),
  suggested_category: z.string(),
  tags: z.array(z.string()),
  needs_user_review: z.boolean(),
}).strict();

export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

// ---------------------------------------------------------------------------
// JSON schema (for OpenAI Responses API strict mode)
// ---------------------------------------------------------------------------

/**
 * The JSON schema sent to OpenAI with `text.format: json_schema`.
 *
 * OpenAI strict mode requires:
 *   - `additionalProperties: false` on every object
 *   - All properties listed in `required`
 *   - Nullable fields use `type: ["string", "null"]`
 *
 * This schema must be structurally identical to the Zod schema above so
 * that the OpenAI response passes Zod validation.
 */
export const documentAnalysisJsonSchema = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: [...DOCUMENT_TYPES],
    },
    title: { type: "string" },
    summary: { type: "string" },
    family_members: {
      type: "array",
      items: {
        type: "object",
        properties: {
          person_id: { type: ["string", "null"] },
          name: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["person_id", "name", "confidence"],
        additionalProperties: false,
      },
    },
    organizations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["name", "type", "confidence"],
        additionalProperties: false,
      },
    },
    dates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          type: { type: "string" },
          label: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["date", "type", "label", "confidence"],
        additionalProperties: false,
      },
    },
    amounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          amount: { type: "string" },
          currency: { type: "string" },
          label: { type: "string" },
          kind: {
            type: "string",
            enum: [...AMOUNT_KINDS],
          },
          value_date: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
        required: [
          "amount",
          "currency",
          "label",
          "kind",
          "value_date",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          due_date: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
        required: ["title", "due_date", "confidence"],
        additionalProperties: false,
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // No type — the label carries what kind of number this is.
          label: { type: "string" },
          value: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["label", "value", "confidence"],
        additionalProperties: false,
      },
    },
    suggested_category: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    needs_user_review: { type: "boolean" },
  },
  required: [
    "document_type",
    "title",
    "summary",
    "family_members",
    "organizations",
    "dates",
    "amounts",
    "tasks",
    "facts",
    "suggested_category",
    "tags",
    "needs_user_review",
  ],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Family context (passed to the LLM system prompt)
// ---------------------------------------------------------------------------

/**
 * Context about the family, passed to the LLM so it can normalize person
 * names against known family members and suggest consistent categories.
 */
export interface FamilyContext {
  /** Family members with their IDs (for person_id matching), names, and roles. */
  members: { id: string; name: string; role: string | null }[];
  /** Existing document categories in the family (distinct documents.category). */
  categories: string[];
  /**
   * The family's collection names. Collections are linked to documents via
   * documents.category === collection.name, so a category suggestion that
   * matches a collection name files the document into that collection.
   */
  collections?: string[];
  /** Existing knowledge nodes (organizations, contracts, etc.). */
  knowledgeNodes: { type: string; label: string }[];
}

// ---------------------------------------------------------------------------
// Confidence-based needs_user_review computation
// ---------------------------------------------------------------------------

/**
 * Compute whether the document needs user review based on confidence
 * thresholds.
 *
 * Returns `true` if any extracted entity (person, organization, date,
 * amount) or task has a confidence value below `LOW_CONFIDENCE_THRESHOLD`.
 *
 * This is used to OVERRIDE the `needs_user_review` value from the LLM,
 * ensuring the threshold logic is deterministic and not dependent on the
 * model's self-assessment.
 *
 * @param analysis - The validated document analysis from the LLM.
 * @returns `true` if user review is needed (any low-confidence entity/task).
 */
export function computeNeedsUserReview(analysis: DocumentAnalysis): boolean {
  const threshold = LOW_CONFIDENCE_THRESHOLD;

  // Check family members.
  for (const member of analysis.family_members) {
    if (member.confidence < threshold) return true;
  }

  // Check organizations.
  for (const org of analysis.organizations) {
    if (org.confidence < threshold) return true;
  }

  // Check dates.
  for (const date of analysis.dates) {
    if (date.confidence < threshold) return true;
  }

  // Check amounts.
  for (const amount of analysis.amounts) {
    if (amount.confidence < threshold) return true;
  }

  // Check tasks.
  for (const task of analysis.tasks) {
    if (task.confidence < threshold) return true;
  }

  // Check facts.
  for (const fact of analysis.facts) {
    if (fact.confidence < threshold) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/**
 * Successful analyze API response.
 *
 * Returns the full document analysis (for the Review Card to display) plus
 * the document status and ID.
 */
export type AnalyzeSuccessResponse = DocumentAnalysis & {
  document_id: string;
  /** "analyzed" for new analysis, "confirmed" when re-analyzing a confirmed document. */
  status: "analyzed" | "confirmed";
};

/**
 * Error analyze API response (same shape as other route errors).
 */
export type AnalyzeErrorResponse = ApiErrorResponse;

// ---------------------------------------------------------------------------
// Document type → icon
// ---------------------------------------------------------------------------

/**
 * Canonical document-type icons — the single source shared by the review
 * UI (review-summary.tsx) and note creation (create-note-sheet.tsx).
 */
export const DOCUMENT_TYPE_ICONS: Record<DocumentType, LucideIcon> = {
  invoice: Receipt,
  letter: Mail,
  contract: FileSignature,
  medical: Stethoscope,
  school: GraduationCap,
  insurance: Shield,
  tax: Landmark,
  note: FileText,
  other: FileText,
};
