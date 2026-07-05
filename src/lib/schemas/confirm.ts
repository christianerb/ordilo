import { z } from "zod";
import { documentAnalysisSchema } from "@/lib/schemas/extraction";

/**
 * Zod schema for the confirm API route payload.
 *
 * The confirm route receives the (possibly edited) document analysis from
 * the Review Card. The payload extends the `DocumentAnalysis` schema with
 * `deletedTaskIndices` — an array of indices of tasks the user deleted
 * in the Review Card (informational; the `tasks` array already excludes
 * deleted tasks).
 *
 * The route uses the edited values from this payload to create the
 * knowledge graph and embeddings, rather than re-reading the original
 * extraction from the database.
 */

// ---------------------------------------------------------------------------
// Confirm payload schema
// ---------------------------------------------------------------------------

/**
 * The confirm payload schema.
 *
 * This reuses the `documentAnalysisSchema` (which validates document_type,
 * title, summary, family_members, organizations, dates, amounts, tasks,
 * suggested_category, tags, needs_user_review) and adds `deletedTaskIndices`.
 *
 * `deletedTaskIndices` is an array of numbers (0-based indices into the
 * original tasks array before deletion). The `tasks` array in the payload
 * already has deleted tasks filtered out, so this field is informational
 * but included for completeness and debugging.
 */
export const confirmPayloadSchema = documentAnalysisSchema.extend({
  deletedTaskIndices: z.array(z.number().int().min(0)).default([]),
});

export type ConfirmPayload = z.infer<typeof confirmPayloadSchema>;

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/**
 * Successful confirm API response.
 */
export type ConfirmSuccessResponse = {
  status: "confirmed";
  document_id: string;
};

/**
 * Error confirm API response (same shape as other route errors).
 */
export type ConfirmErrorResponse = {
  error: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Confirm source status
// ---------------------------------------------------------------------------

/**
 * Statuses from which the confirm flow can be triggered.
 *
 * Confirm can only start from `analyzed` — the document must have been
 * extracted and reviewed by the user. Documents in other statuses are
 * rejected with a 409 (see VAL-CONFIRM-010).
 */
export const CONFIRM_ALLOWED_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  "analyzed",
]);

// ---------------------------------------------------------------------------
// Knowledge graph constants
// ---------------------------------------------------------------------------

/**
 * Relation types for knowledge edges created during confirm.
 *
 * - `mentions`: the document mentions/references a person or organization.
 *
 * These are internal graph relation types — the user never sees them
 * (per the "knowledge graph invisibility" requirement).
 */
export const EDGE_RELATION_PERSON = "mentions" as const;
export const EDGE_RELATION_ORGANIZATION = "mentions" as const;

/**
 * Knowledge node types created during confirm.
 */
export const NODE_TYPE_DOCUMENT = "document" as const;
export const NODE_TYPE_PERSON = "person" as const;
export const NODE_TYPE_ORGANIZATION = "organization" as const;
