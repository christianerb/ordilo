import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import type { ConfirmRpcEntity } from "@/types/database";
import {
  meaningfulLabel,
  parseAmountToMinor,
  toIsoDateOrNull,
  GENERIC_DATE_LABELS,
  GENERIC_AMOUNT_LABELS,
} from "@/lib/analysis-cleanup";
import { contactSourceKey } from "@/lib/contacts";

/**
 * The part of a `DocumentAnalysis` that becomes `extracted_entities` rows.
 * Tasks and facts live in their own tables and are built separately.
 */
export type EntitySource = Pick<
  DocumentAnalysis,
  | "family_members"
  | "organizations"
  | "contacts"
  | "dates"
  | "amounts"
  | "suggested_category"
  | "tags"
>;

/**
 * Build the `extracted_entities` rows (as RPC params) from an analysis.
 *
 * Shared by the confirm route (first time a document enters the family
 * book) and the update route (a later correction of an already-confirmed
 * document), so both write entities in exactly the same shape — a value
 * corrected after confirmation is indistinguishable from one that was
 * right the first time.
 */
export function buildEntityRows(analysis: EntitySource): ConfirmRpcEntity[] {
  const entities: ConfirmRpcEntity[] = [];

  // Persons.
  for (const member of analysis.family_members) {
    entities.push({
      entity_type: "person",
      entity_value: member.name,
      normalized_value: member.name.toLowerCase().trim(),
      label: null,
      confidence: member.confidence,
      linked_object_id: member.person_id ?? null,
    });
  }

  // Organizations.
  for (const org of analysis.organizations) {
    entities.push({
      entity_type: "organization",
      entity_value: org.name,
      normalized_value: org.name.toLowerCase().trim(),
      label: null,
      confidence: org.confidence,
      linked_object_id: null,
    });
  }

  for (const contact of analysis.contacts ?? []) {
    entities.push({
      entity_type: "contact",
      entity_value: JSON.stringify(contact),
      normalized_value: contactSourceKey(contact),
      label: contact.name,
      confidence: contact.confidence,
      linked_object_id: null,
    });
  }

  // Dates.
  for (const date of analysis.dates) {
    entities.push({
      entity_type: "date",
      entity_value: date.date,
      normalized_value: date.date,
      label: meaningfulLabel(date.label, GENERIC_DATE_LABELS),
      confidence: date.confidence,
      linked_object_id: null,
    });
  }

  // Amounts.
  for (const amount of analysis.amounts) {
    entities.push({
      entity_type: "amount",
      entity_value: `${amount.amount} ${amount.currency}`.trim(),
      normalized_value: amount.amount,
      label: meaningfulLabel(amount.label, GENERIC_AMOUNT_LABELS),
      amount_minor: parseAmountToMinor(amount.amount),
      currency: amount.currency.trim().toUpperCase() || "EUR",
      amount_kind: amount.kind,
      value_date: toIsoDateOrNull(amount.value_date),
      confidence: amount.confidence,
      linked_object_id: null,
    });
  }

  // Category.
  if (analysis.suggested_category) {
    entities.push({
      entity_type: "category",
      entity_value: analysis.suggested_category,
      normalized_value: analysis.suggested_category.toLowerCase().trim(),
      label: null,
      confidence: 1.0,
      linked_object_id: null,
    });
  }

  // Tags.
  for (const tag of analysis.tags) {
    entities.push({
      entity_type: "tag",
      entity_value: tag,
      normalized_value: tag.toLowerCase().trim(),
      label: null,
      confidence: 1.0,
      linked_object_id: null,
    });
  }

  return entities;
}
