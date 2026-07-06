/**
 * Person profile utility functions.
 *
 * Pure helpers for building and sorting timeline events from the raw
 * documents, tasks, and date entities linked to a family member. These
 * functions have no side effects and are unit-tested independently of
 * the Supabase data layer.
 *
 * All labels are in German (UI text). Code and comments are in English.
 */

// ---------------------------------------------------------------------------
// Types — raw data rows passed in from the profile page
// ---------------------------------------------------------------------------

/**
 * A document row (subset) linked to a person, as fetched from the
 * `documents` table for the person profile.
 */
export interface ProfileDocument {
  id: string;
  title: string | null;
  document_type: string | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  original_filename: string | null;
}

/**
 * A task row (subset) linked to a person via its source document.
 */
export interface ProfileTask {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  document_id: string;
}

/**
 * A date entity row (subset) from `extracted_entities`, representing an
 * important date extracted from a document linked to this person.
 */
export interface ProfileDateEntity {
  id: string;
  entity_value: string;
  document_id: string;
}

// ---------------------------------------------------------------------------
// Types — timeline event model
// ---------------------------------------------------------------------------

/**
 * The type of a timeline event, determining its icon and label.
 * - "document": a document was confirmed/added to this person
 * - "task": a task with a due date
 * - "date": an important date extracted from a document
 */
export type TimelineEventType = "document" | "task" | "date";

/**
 * A single timeline event for the person profile timeline.
 */
export interface TimelineEvent {
  /** The event type (determines icon and label). */
  type: TimelineEventType;
  /** The event date as YYYY-MM-DD (used for sorting and display). */
  date: string;
  /** The event title (e.g. document title or task title). */
  title: string;
  /** Optional description (e.g. document type label or task priority). */
  description?: string;
  /** The linked document ID (for navigation to the document detail). */
  documentId?: string;
}

// ---------------------------------------------------------------------------
// Date extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the date portion (YYYY-MM-DD) from an ISO datetime string or
 * a plain date string.
 *
 * Returns null when the input is null, empty, or does not contain a valid
 * date prefix.
 *
 * @param iso - An ISO datetime string, a YYYY-MM-DD string, or null.
 * @returns The YYYY-MM-DD date portion, or null.
 */
function extractDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dateOnly = iso.split(/[T ]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;
  return null;
}

// ---------------------------------------------------------------------------
// Build timeline events
// ---------------------------------------------------------------------------

/**
 * Build a list of timeline events from the raw documents, tasks, and date
 * entities linked to a person.
 *
 * - Document events use `confirmed_at` as the date (falling back to
 *   `created_at` when `confirmed_at` is null). The title is the document
 *   title (or filename fallback). Documents with neither date are skipped.
 * - Task events use `due_date` as the date. Tasks without a due date are
 *   skipped.
 * - Date entity events use the `entity_value` as the date (must be a valid
 *   YYYY-MM-DD string). Invalid dates are skipped.
 *
 * The returned events are NOT sorted — call `sortTimelineEvents` to order
 * them.
 *
 * @param documents - Documents linked to the person.
 * @param tasks - Tasks linked to the person via their source documents.
 * @param dateEntities - Date entities from documents linked to the person.
 * @returns An unsorted array of timeline events.
 */
export function buildTimelineEvents(
  documents: ProfileDocument[],
  tasks: ProfileTask[],
  dateEntities: ProfileDateEntity[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Document events.
  for (const doc of documents) {
    const date = extractDate(doc.confirmed_at) ?? extractDate(doc.created_at);
    if (!date) continue;

    const title = doc.title?.trim() || doc.original_filename?.trim() || "Dokument";

    events.push({
      type: "document",
      date,
      title,
      documentId: doc.id,
    });
  }

  // Task events.
  for (const task of tasks) {
    const date = extractDate(task.due_date);
    if (!date) continue;

    events.push({
      type: "task",
      date,
      title: task.title,
      documentId: task.document_id,
    });
  }

  // Date entity events.
  for (const entity of dateEntities) {
    const date = extractDate(entity.entity_value);
    if (!date) continue;

    events.push({
      type: "date",
      date,
      title: "Termin",
      documentId: entity.document_id,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Sort timeline events
// ---------------------------------------------------------------------------

/**
 * Sort timeline events chronologically.
 *
 * @param events - The timeline events to sort.
 * @param order - "asc" for oldest-first, "desc" for newest-first.
 * @returns A new sorted array (does not mutate the input).
 */
export function sortTimelineEvents(
  events: TimelineEvent[],
  order: "asc" | "desc" = "desc",
): TimelineEvent[] {
  const sorted = [...events].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return order === "asc" ? cmp : -cmp;
  });
  return sorted;
}
