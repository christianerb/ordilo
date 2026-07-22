/**
 * Home dashboard utility functions — pure helpers for filtering tasks and
 * formatting timestamps for the Home dashboard sections.
 *
 * All labels are in German (UI text). Code and comments are in English.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A task row with the fields needed by the home dashboard. */
export interface HomeTask {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  confidence: number;
  confirmed: boolean;
  created_at: string;
  tags: string[];
  document_id: string | null;
  document_title?: string | null;
  assigned_to?: string | null;
}

/** A document row with the fields needed by the home dashboard. */
export interface HomeDocument {
  id: string;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Get a Date as a YYYY-MM-DD string using local time components.
 * Avoids UTC timezone shifting the day.
 */
function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Task filtering
// ---------------------------------------------------------------------------

/** Number of days ahead for the "Heute wichtig" horizon (today + this week). */
export const HEUTE_WICHTIG_DAYS = 7;

/**
 * Maximum items to show per Aufgaben subgroup on the Home dashboard.
 *
 * Home is a curated summary, not the full list — /aufgaben has no limit.
 * Kept small (3 per subgroup) so the dashboard stays scannable; a "Alle
 * anzeigen" link appears when more tasks exist than are shown.
 */
export const HEUTE_WICHTIG_LIMIT = 3;

/** Maximum items to show in "Später". */
export const FRISTEN_LIMIT = 3;

/** Maximum items to show in "Überfällig" (overdue tasks). */
export const UEBERFAELLIG_LIMIT = 3;

/** Maximum items to show in "Neue Dokumente zur Bestätigung". */
export const REVIEW_DOCS_LIMIT = 3;

/** Maximum items to show in "Zuletzt gescannt". */
export const RECENT_DOCS_LIMIT = 3;

/**
 * Filter tasks for the "Diese Woche" (This week) subgroup within the
 * Aufgaben timeline.
 *
 * Returns confirmed, open tasks with a due_date within the near-future
 * horizon (today through ~7 days ahead), EXCLUDING overdue tasks.
 * Sorted by due_date ascending (soonest first).
 * Limited to HEUTE_WICHTIG_LIMIT items.
 *
 * @param tasks - All tasks for the family.
 * @param referenceDate - The reference "today" (defaults to now).
 * @returns Filtered and sorted tasks for the "Diese Woche" subgroup.
 */
export function filterHeuteWichtig(
  tasks: HomeTask[],
  referenceDate: Date = new Date(),
): HomeTask[] {
  const today = toLocalDateStr(referenceDate);
  const horizon = toLocalDateStr(
    new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() + HEUTE_WICHTIG_DAYS,
    ),
  );

  return tasks
    .filter(
      (t) =>
        t.status === "open" &&
        t.confirmed &&
        t.due_date !== null &&
        t.due_date >= today &&
        t.due_date <= horizon,
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))
    .slice(0, HEUTE_WICHTIG_LIMIT);
}

/**
 * Filter tasks for the "Überfällig" (Overdue) subgroup within the Aufgaben
 * timeline.
 *
 * Returns confirmed, open tasks with a due_date in the past (before today),
 * sorted by due_date ascending (most overdue first).
 * Limited to UEBERFAELLIG_LIMIT items.
 *
 * @param tasks - All tasks for the family.
 * @param referenceDate - The reference "today" (defaults to now).
 * @returns Filtered and sorted overdue tasks.
 */
export function filterUeberfaellig(
  tasks: HomeTask[],
  referenceDate: Date = new Date(),
): HomeTask[] {
  const today = toLocalDateStr(referenceDate);

  return tasks
    .filter(
      (t) =>
        t.status === "open" &&
        t.confirmed &&
        t.due_date !== null &&
        t.due_date < today,
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))
    .slice(0, UEBERFAELLIG_LIMIT);
}

/**
 * Filter tasks for the "Später" (Later) subgroup within the Aufgaben
 * timeline.
 *
 * Returns confirmed, open tasks with a due_date beyond the "Diese Woche"
 * horizon (> 7 days from today), sorted by due_date ascending (soonest first).
 * This ensures no overlap with "Diese Woche" — tasks due within 7 days
 * appear only in "Diese Woche", not in both subgroups.
 * Limited to FRISTEN_LIMIT items.
 *
 * @param tasks - All tasks for the family.
 * @param referenceDate - The reference "today" (defaults to now).
 * @returns Filtered and sorted tasks for the "Später" subgroup.
 */
export function filterFristen(
  tasks: HomeTask[],
  referenceDate: Date = new Date(),
): HomeTask[] {
  const horizon = toLocalDateStr(
    new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() + HEUTE_WICHTIG_DAYS,
    ),
  );

  return tasks
    .filter(
      (t) =>
        t.status === "open" &&
        t.confirmed &&
        t.due_date !== null &&
        t.due_date > horizon,
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))
    .slice(0, FRISTEN_LIMIT);
}

/**
 * Filter recent documents for the "Zuletzt gescannt" section.
 *
 * Excludes documents with status='failed' (VAL-CROSS-013: failed documents
 * must remain visible only on /dokumente and must NOT surface downstream on /home).
 * Preserves the input order (the DB query already sorts by created_at desc).
 * Limited to RECENT_DOCS_LIMIT items.
 *
 * @param documents - Recent documents fetched from the DB (any status).
 * @returns Filtered documents with failed ones excluded, limited to RECENT_DOCS_LIMIT.
 */
export function filterRecentDocuments(
  documents: HomeDocument[],
): HomeDocument[] {
  return documents
    .filter((d) => d.status !== "failed")
    .slice(0, RECENT_DOCS_LIMIT);
}

/**
 * Format an ISO timestamp as a German datetime string.
 *
 * Produces a format like "06.07.2026, 14:30 Uhr" using local time
 * components. Returns null for null/undefined/empty/invalid input.
 *
 * @param iso - An ISO timestamp string, or null/undefined.
 * @returns The formatted German datetime, or null.
 *
 * @example
 * formatGermanTimestamp("2026-07-06T14:30:00Z")  // → "06.07.2026, 14:30 Uhr" (local time)
 * formatGermanTimestamp(null)                     // → null
 */
export function formatGermanTimestamp(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}.${month}.${year}, ${hours}:${minutes} Uhr`;
}
