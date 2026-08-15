import { z } from "zod";
import { documentAnalysisSchema } from "@/lib/schemas/extraction";
import type { ApiErrorResponse } from "@/lib/schemas/api";

/**
 * Payload for editing a document that is already in the family book
 * (PATCH /api/documents/[id]).
 *
 * It is the confirm payload minus the two groups an edit deliberately
 * leaves alone:
 *
 *   - `tasks` — they live on their own, get completed and assigned, and
 *     have their own detail sheet. Rewriting them from a document edit
 *     would reset that state.
 *   - `facts` — "Nummern & Kennungen" are edited row by row through
 *     /api/documents/[id]/facts, which writes them immediately.
 *
 * Everything the user can see and change in the document sheet is here:
 * title, summary, type, persons, organizations, dates, amounts, the
 * collection (category), and tags.
 */
export const documentUpdatePayloadSchema = documentAnalysisSchema
  .omit({ tasks: true, facts: true, needs_user_review: true })
  .strict();

export type DocumentUpdatePayload = z.infer<typeof documentUpdatePayloadSchema>;

/** Successful update response. */
export type DocumentUpdateSuccessResponse = {
  status: "updated";
  document_id: string;
};

/** Error response (same shape as every other document route). */
export type DocumentUpdateErrorResponse = ApiErrorResponse;
