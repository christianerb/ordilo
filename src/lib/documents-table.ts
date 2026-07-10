import { createClient } from "@/lib/supabase/client";

/**
 * Per-document metadata needed by the documents table (person names, tags,
 * and a resolved "document date") — everything the `documents` table row
 * itself does not carry, reconstructed from `extracted_entities`.
 */
export interface DocumentTableMeta {
  /** Distinct person names linked to the document (entity_type "person"). */
  persons: string[];
  /** Distinct tags (entity_type "tag"). */
  tags: string[];
  /**
   * The document's own date (e.g. invoice/letter date), resolved as the
   * earliest extracted `date` entity. Falls back to `null` when the
   * document has no extracted dates — callers should fall back to
   * `created_at` in that case.
   */
  documentDate: string | null;
}

/**
 * Fetch person/tag/date metadata for a set of documents in one query,
 * grouped by document ID.
 *
 * Used by the documents table view to populate the "Person", "Tags", and
 * "Datum" columns/filters without duplicating the full analysis
 * reconstruction that `fetchDocumentAnalysis` does for a single document.
 *
 * @param documentIds - The document IDs to fetch metadata for.
 * @returns A map of document ID → { persons, tags, documentDate }. IDs with
 *          no extracted entities are omitted (callers should default to
 *          empty arrays / null when a key is missing).
 */
export async function fetchDocumentsTableMeta(
  documentIds: string[],
): Promise<Record<string, DocumentTableMeta>> {
  if (documentIds.length === 0) return {};

  const supabase = createClient();

  const { data: entities, error } = await supabase
    .from("extracted_entities")
    .select("document_id, entity_type, entity_value")
    .in("document_id", documentIds)
    .in("entity_type", ["person", "tag", "date"]);

  if (error || !entities) return {};

  const meta: Record<string, DocumentTableMeta> = {};

  for (const entity of entities) {
    const current = meta[entity.document_id] ?? {
      persons: [],
      tags: [],
      documentDate: null,
    };

    if (entity.entity_type === "person") {
      if (!current.persons.includes(entity.entity_value)) {
        current.persons.push(entity.entity_value);
      }
    } else if (entity.entity_type === "tag") {
      if (!current.tags.includes(entity.entity_value)) {
        current.tags.push(entity.entity_value);
      }
    } else if (entity.entity_type === "date") {
      // Keep the earliest date seen for this document.
      if (!current.documentDate || entity.entity_value < current.documentDate) {
        current.documentDate = entity.entity_value;
      }
    }

    meta[entity.document_id] = current;
  }

  return meta;
}
