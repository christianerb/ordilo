import { z } from "zod";
import { FACT_TYPES } from "@/lib/schemas/extraction";

/**
 * Zod schemas for /api/documents/[id]/facts — user-managed typed facts
 * (serial numbers, contract numbers, IBANs, …) on confirmed documents.
 */

/** Maximum length of a fact value. */
export const MAX_FACT_VALUE_LENGTH = 200;
/** Maximum length of an optional fact label. */
export const MAX_FACT_LABEL_LENGTH = 120;

const factValue = z.string().trim().min(1).max(MAX_FACT_VALUE_LENGTH);
const factLabel = z.string().trim().min(1).max(MAX_FACT_LABEL_LENGTH);

/** POST /api/documents/[id]/facts — add a fact. */
export const createFactSchema = z.object({
  fact_type: z.enum(FACT_TYPES),
  value: factValue,
  label: factLabel.optional(),
});
export type CreateFactInput = z.infer<typeof createFactSchema>;

/**
 * PATCH /api/documents/[id]/facts — correct a fact.
 *
 * Value, label and type are each optional so a family can fix what is
 * actually wrong: a misread digit, an unhelpful label ("Unklare
 * Kennnummer" → "Steuer-ID Hanna"), or a wrong type — the label and type
 * are what the fact search matches questions against. At least one of
 * them has to be present.
 */
export const updateFactSchema = z
  .object({
    fact_id: z.string().min(1),
    value: factValue.optional(),
    label: factLabel.optional(),
    fact_type: z.enum(FACT_TYPES).optional(),
  })
  .refine(
    (data) =>
      data.value !== undefined ||
      data.label !== undefined ||
      data.fact_type !== undefined,
    { message: "Nothing to update" },
  );
export type UpdateFactInput = z.infer<typeof updateFactSchema>;

/** DELETE /api/documents/[id]/facts — remove a fact. */
export const deleteFactSchema = z.object({
  fact_id: z.string().min(1),
});
export type DeleteFactInput = z.infer<typeof deleteFactSchema>;
