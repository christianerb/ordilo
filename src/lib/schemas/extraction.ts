import { z } from "zod";

/**
 * Zod schema and JSON schema for the LLM document analysis extraction.
 *
 * This module defines:
 *   - The Zod schema used to validate the OpenAI structured output response
 *   - The JSON schema sent to OpenAI with `response_format: json_schema` (strict mode)
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
  other: "Sonstiges",
};

// ---------------------------------------------------------------------------
// Task priority enum
// ---------------------------------------------------------------------------

/**
 * Task priority levels extracted by the LLM.
 */
export const TASK_PRIORITIES = ["low", "medium", "high"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

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
 * Zod schema for a single extracted amount.
 */
const amountSchema = z.object({
  amount: z.string(),
  currency: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Zod schema for a single extracted task.
 * `due_date` is nullable — null when the task has no deadline.
 */
const taskSchema = z.object({
  title: z.string().min(1),
  due_date: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  confidence: z.number().min(0).max(1),
});

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
  suggested_category: z.string(),
  tags: z.array(z.string()),
  needs_user_review: z.boolean(),
}).strict();

export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

// ---------------------------------------------------------------------------
// JSON schema (for OpenAI strict mode response_format)
// ---------------------------------------------------------------------------

/**
 * The JSON schema sent to OpenAI with `response_format: json_schema`.
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
          confidence: { type: "number" },
        },
        required: ["amount", "currency", "label", "confidence"],
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
          priority: {
            type: "string",
            enum: [...TASK_PRIORITIES],
          },
          confidence: { type: "number" },
        },
        required: ["title", "due_date", "priority", "confidence"],
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
  status: "analyzed";
};

/**
 * Error analyze API response (same shape as other route errors).
 */
export type AnalyzeErrorResponse = {
  error: string;
  code: string;
};
