import { z } from "zod";
import { documentAnalysisSchema } from "@/lib/schemas/extraction";
import type { ApiErrorResponse } from "@/lib/schemas/api";

/**
 * Confirmed metadata edits retain the existing web contract. Native callers
 * may additionally submit corrections with a revision and stable task/fact
 * IDs; the wrapper updates them atomically without resetting task progress.
 */
export const documentUpdatePayloadSchema = documentAnalysisSchema
  .omit({ tasks: true, facts: true, needs_user_review: true })
  .extend({
    corrections: z.object({
      revision: z.string().regex(/^[a-f0-9]{32}$/),
      tasks: z.array(z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200), due_date: z.iso.date().nullable() })).max(100),
      facts: z.array(z.object({ id: z.string().uuid().optional(), label: z.string().trim().min(1).max(200), value: z.string().trim().min(1).max(1000) })).max(100),
      date_changes: z.array(z.object({ previous_date: z.iso.date(), previous_label: z.string(), date: z.iso.date(), label: z.string().trim().min(1).max(160) })).max(100),
    }).strict().optional(),
  })
  .strict();

export type DocumentUpdatePayload = z.infer<typeof documentUpdatePayloadSchema>;

/** Successful update response. */
export type DocumentUpdateSuccessResponse = {
  status: "updated";
  document_id: string;
};

/** Error response (same shape as every other document route). */
export type DocumentUpdateErrorResponse = ApiErrorResponse;
