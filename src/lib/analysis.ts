import { createClient } from "@/lib/supabase/client";
import { getFamilyId } from "@/lib/supabase/client-helpers";
import {
  computeNeedsUserReview,
  DOCUMENT_TYPES,
  TASK_PRIORITIES,
  FACT_TYPES,
  type DocumentAnalysis,
  type DocumentType,
  type TaskPriority,
  type FactType,
} from "@/lib/schemas/extraction";
import type { Database } from "@/types/database";

/**
 * Client-side utilities for fetching and reconstructing a document's
 * analysis from the database.
 *
 * The analyze API route stores extraction results across multiple tables:
 *   - documents (title, summary, document_type, category)
 *   - extracted_entities (one row per entity: person, organization, date,
 *     amount, category, tag)
 *   - tasks (one row per extracted task)
 *
 * This module reconstructs the `DocumentAnalysis` object from those tables
 * so the Review Card can display the analysis on page load (not just
 * immediately after the analyze API call returns).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntityRow = Database["public"]["Tables"]["extracted_entities"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type FactRow = Database["public"]["Tables"]["document_facts"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

/**
 * Family member option for the person edit dropdown.
 */
export interface FamilyMemberOption {
  id: string;
  name: string;
  role: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the family members for the current user's family.
 *
 * Used by the Review Card to populate the person edit dropdown and the
 * low-confidence disambiguation prompt.
 *
 * @returns An array of family member options (id, name, role), or an empty
 *          array if the user has no family or no members.
 */
export async function fetchFamilyMembers(): Promise<FamilyMemberOption[]> {
  const supabase = createClient();

  // Get the user's family.
  const familyId = await getFamilyId(supabase);
  if (!familyId) return [];

  const { data: members, error: membersError } = await supabase
    .from("family_members")
    .select("id, name, role")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (membersError || !members) return [];

  return members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
  }));
}

/**
 * Fetch the existing categories for the current user's family.
 *
 * Used by the Review Card to populate the category edit dropdown
 * (existing categories + free-text option).
 *
 * @returns An array of distinct category strings, or an empty array.
 */
export async function fetchExistingCategories(): Promise<string[]> {
  const supabase = createClient();

  const familyId = await getFamilyId(supabase);
  if (!familyId) return [];

  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("category")
    .eq("family_id", familyId)
    .not("category", "is", null);

  if (docsError || !docs) return [];

  const categories = [
    ...new Set(
      docs
        .map((d) => d.category)
        .filter((c): c is string => Boolean(c && c.trim())),
    ),
  ];

  return categories;
}

/**
 * Fetch a document's analysis from the database and reconstruct the
 * `DocumentAnalysis` object.
 *
 * This queries:
 *   - documents (title, summary, document_type, category, status)
 *   - extracted_entities (all entity types with confidence)
 *   - tasks (with confidence)
 *
 * And reconstructs the analysis object that the analyze API route
 * originally returned.
 *
 * @param documentId - The document ID.
 * @returns The reconstructed DocumentAnalysis, or null if the document
 *          is not found or has no analysis data.
 */
export async function fetchDocumentAnalysis(
  documentId: string,
): Promise<DocumentAnalysis | null> {
  const supabase = createClient();

  // Fetch the document metadata.
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("id, title, summary, document_type, category, status")
    .eq("id", documentId)
    .maybeSingle();

  if (docError || !document) return null;

  // Fetch extracted entities.
  const { data: entities, error: entitiesError } = await supabase
    .from("extracted_entities")
    .select("*")
    .eq("document_id", documentId);

  if (entitiesError || !entities) return null;

  // Fetch tasks.
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("document_id", documentId);

  if (tasksError || !tasks) return null;

  // Fetch typed facts (serial numbers, contract numbers, ...). Errors fall
  // back to an empty list — facts are additive to the analysis.
  const { data: facts } = await supabase
    .from("document_facts")
    .select("*")
    .eq("document_id", documentId);

  return reconstructAnalysis(document, entities, tasks, facts ?? []);
}

// ---------------------------------------------------------------------------
// Internal: reconstruct the DocumentAnalysis from DB rows
// ---------------------------------------------------------------------------

/**
 * Reconstruct the `DocumentAnalysis` object from database rows.
 *
 * Maps extracted_entities (grouped by entity_type) and tasks back into the
 * schema shape that the analyze API route returns.
 */
function reconstructAnalysis(
  document: Pick<
    DocumentRow,
    "title" | "summary" | "document_type" | "category"
  >,
  entities: EntityRow[],
  tasks: TaskRow[],
  facts: FactRow[] = [],
): DocumentAnalysis {
  // Group entities by type.
  const persons = entities.filter((e) => e.entity_type === "person");
  const organizations = entities.filter(
    (e) => e.entity_type === "organization",
  );
  const dates = entities.filter((e) => e.entity_type === "date");
  const amounts = entities.filter((e) => e.entity_type === "amount");
  const categoryEntities = entities.filter(
    (e) => e.entity_type === "category",
  );
  const tagEntities = entities.filter((e) => e.entity_type === "tag");

  // Determine the document type (fallback to "other").
  const documentType = isDocumentType(document.document_type)
    ? document.document_type
    : "other";

  // Determine the suggested category (from entity or document).
  const suggestedCategory =
    categoryEntities[0]?.entity_value || document.category || "Sonstiges";

  // Reconstruct family_members.
  const familyMembers = persons.map((p) => ({
    person_id: p.linked_object_id ?? null,
    name: p.entity_value,
    confidence: p.confidence ?? 0,
  }));

  // Reconstruct organizations.
  const orgs = organizations.map((o) => ({
    name: o.entity_value,
    type: o.normalized_value || "organization",
    confidence: o.confidence ?? 0,
  }));

  // Reconstruct dates.
  const dateEntries = dates.map((d) => ({
    date: d.entity_value,
    type: "date",
    label: "Datum",
    confidence: d.confidence ?? 0,
  }));

  // Reconstruct amounts — entity_value is stored as "amount currency".
  const amountEntries = amounts.map((a) => {
    const parts = a.entity_value.split(" ");
    const currency = parts.length > 1 ? parts[parts.length - 1] : "EUR";
    const amount = parts.slice(0, -1).join(" ") || a.entity_value;
    return {
      amount,
      currency,
      label: "Betrag",
      confidence: a.confidence ?? 0,
    };
  });

  // Reconstruct tags.
  const tags = tagEntities.map((t) => t.entity_value);

  // Reconstruct facts (typed identifiers).
  const factEntries = facts.map((f) => ({
    fact_type: isFactType(f.fact_type) ? f.fact_type : "other",
    label: f.label,
    value: f.value,
    confidence: f.confidence ?? 0,
  }));

  // Reconstruct tasks.
  const taskEntries = tasks.map((t) => ({
    title: t.title,
    due_date: t.due_date,
    priority: isTaskPriority(t.priority) ? t.priority : "medium",
    confidence: t.confidence ?? 0,
  }));

  const analysis: DocumentAnalysis = {
    document_type: documentType,
    title: document.title || "Dokument",
    summary: document.summary || "",
    family_members: familyMembers,
    organizations: orgs,
    dates: dateEntries,
    amounts: amountEntries,
    tasks: taskEntries,
    facts: factEntries,
    suggested_category: suggestedCategory,
    tags,
    needs_user_review: false, // Computed below
  };

  // Compute needs_user_review based on confidence thresholds.
  analysis.needs_user_review = computeNeedsUserReview(analysis);

  return analysis;
}

/**
 * Type guard for DocumentType.
 */
function isDocumentType(value: string | null | undefined): value is DocumentType {
  if (!value) return false;
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Type guard for FactType.
 */
function isFactType(value: string | null | undefined): value is FactType {
  if (!value) return false;
  return (FACT_TYPES as readonly string[]).includes(value);
}

/**
 * Type guard for TaskPriority.
 */
function isTaskPriority(
  value: string | null | undefined,
): value is TaskPriority {
  if (!value) return false;
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}
