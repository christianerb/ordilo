import { z } from "zod";

import { getSupabase } from "./supabase";
import { colors } from "@/src/theme/tokens";

/**
 * Collections ("Sammlungen") for the native app.
 *
 * Fachliche Referenz ist die Web-App: Icon-/Farboptionen, Validierung und
 * deutsche Fehlertexte sind 1:1 aus src/lib/schemas/collections.ts
 * portiert, die Schreiblogik aus src/app/(app)/sammlungen/actions.ts.
 * Icon-Komponenten liegen bewusst NICHT hier (die Bibliotheken bleiben
 * pure Logik, damit Jest sie ohne RN-Rendering laden kann) — das Mapping
 * von Icon-Key auf Lucide-Komponente macht src/components/collection-icon.tsx.
 *
 * Eine Sammlung ist über das Freitextfeld `documents.category` an ihre
 * Dokumente gebunden (Namensabgleich, Groß-/Kleinschreibung egal) — siehe
 * supabase/migrations/0012_collections.sql. Beim Umbenennen zieht die
 * App den neuen Namen auf die passenden Dokumente nach, beim Löschen
 * bleibt die Kategorie der Dokumente unangetastet.
 *
 * Der native Client schreibt mit dem Publishable Key direkt gegen
 * Supabase — RLS bleibt die Autorität, wie beim Browser-Client.
 */

export const FRIENDLY_ERROR =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

const DUPLICATE_ERROR = "Diese Sammlung gibt es schon.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Collection = {
  id: string;
  family_id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
};

export type CollectionInput = {
  name: string;
  icon: string;
  color: string;
};

export type CollectionResult =
  | { success: true; collection: Collection }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Icon options
// ---------------------------------------------------------------------------

/** A selectable icon key in the collection icon picker. */
export interface CollectionIconOption {
  key: string;
  label: string;
}

export const COLLECTION_ICON_OPTIONS: readonly CollectionIconOption[] = [
  { key: "file-text", label: "Dokument" },
  { key: "receipt", label: "Rechnung" },
  { key: "building", label: "Gebäude" },
  { key: "shield", label: "Vertrag" },
  { key: "heart", label: "Gesundheit" },
  { key: "graduation-cap", label: "Schule" },
  { key: "car", label: "Auto" },
  { key: "home", label: "Zuhause" },
  { key: "briefcase", label: "Arbeit" },
  { key: "wallet", label: "Finanzen" },
] as const;

/** Fallback icon key for unknown/legacy stored values. */
export const DEFAULT_COLLECTION_ICON_KEY = "file-text";

// ---------------------------------------------------------------------------
// Color options
// ---------------------------------------------------------------------------

/** A selectable color swatch (background tint + icon foreground). */
export interface CollectionColorOption {
  key: string;
  label: string;
  /** Background color for the icon square. */
  bg: string;
  /** Foreground color for the icon glyph. */
  fg: string;
}

/**
 * Mirrors the web swatches, with the CSS variables resolved to the native
 * design tokens (web: --petrol → harborBlue, --apricot → warmApricot).
 */
export const COLLECTION_COLOR_OPTIONS: readonly CollectionColorOption[] = [
  { key: "petrol", label: "Petrol", bg: "rgba(48, 84, 96, 0.1)", fg: colors.harborBlue },
  { key: "apricot", label: "Apricot", bg: "rgba(228, 96, 24, 0.12)", fg: colors.warmApricot },
  { key: "destructive", label: "Rot", bg: "rgba(192, 57, 43, 0.1)", fg: colors.destructive },
  { key: "blue-soft", label: "Blau", bg: colors.blueSoft, fg: colors.harborBlue },
  { key: "mist", label: "Grau", bg: colors.sandLight, fg: colors.mistDark },
  { key: "apricot-light", label: "Sand", bg: "rgba(240, 180, 160, 0.3)", fg: colors.warmApricot },
] as const;

const DEFAULT_COLOR_KEY = "petrol";

/**
 * Resolve the color option for a stored color key.
 * Falls back to petrol for unknown/legacy keys.
 */
export function getCollectionColor(colorKey: string | null | undefined): CollectionColorOption {
  return (
    COLLECTION_COLOR_OPTIONS.find((opt) => opt.key === colorKey) ??
    COLLECTION_COLOR_OPTIONS.find((opt) => opt.key === DEFAULT_COLOR_KEY)!
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Bitte gib einen Namen ein")
  .max(50, "Der Name ist zu lang (maximal 50 Zeichen)");

const collectionIconSchema = z
  .string()
  .refine(
    (key) => COLLECTION_ICON_OPTIONS.some((opt) => opt.key === key),
    "Ungültiges Icon",
  );

const collectionColorSchema = z
  .string()
  .refine(
    (key) => COLLECTION_COLOR_OPTIONS.some((opt) => opt.key === key),
    "Ungültige Farbe",
  );

export const collectionInputSchema = z.object({
  name: collectionNameSchema,
  icon: collectionIconSchema,
  color: collectionColorSchema,
});

/**
 * Validate a collection name/icon/color input.
 *
 * Returns `{ success: true, data }` with the trimmed name when valid, or
 * `{ success: false, error }` with a German error message when invalid.
 */
export function validateCollectionInput(
  input: CollectionInput,
):
  | { success: true; data: CollectionInput }
  | { success: false; error: string } {
  const parsed = collectionInputSchema.safeParse(input);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Bitte gib einen Namen ein";
    return { success: false, error: message };
  }
  return { success: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Canonical category matching (Beziehungen)
// ---------------------------------------------------------------------------

/**
 * 1:1 port of the matching predicate from src/lib/categories.ts (web).
 * The contract there demands that EVERY surface linking
 * `documents.category` to a collection name uses this same equality —
 * a weaker comparison (plain lowercase) would show "Rechnungen"
 * documents and a "Rechnung" collection as two different folders.
 */

/** Normalize a category for comparison: lowercase, trimmed, collapsed whitespace. */
function normalizeCategoryName(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Fold trivial German singular/plural variants onto a comparable stem:
 * "rechnungen" → "rechnung", "verträge" → "verträg", "briefe" → "brief".
 * Deliberately conservative — only common suffixes, only on words long
 * enough that stripping cannot collide short words.
 */
function pluralStem(value: string): string {
  if (value.length > 5 && value.endsWith("en")) return value.slice(0, -2);
  if (value.length > 4 && (value.endsWith("e") || value.endsWith("n") || value.endsWith("s"))) {
    return value.slice(0, -1);
  }
  return value;
}

/** Fold German umlauts so plural umlautation compares equal ("Verträge" ↔ "Vertrag"). */
function foldUmlauts(value: string): string {
  return value
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

/** Whether a document category and a collection name refer to the same thing. */
export function categoriesMatch(a: string, b: string): boolean {
  const normalizedA = normalizeCategoryName(a);
  const normalizedB = normalizeCategoryName(b);
  if (normalizedA === normalizedB) return true;
  return (
    foldUmlauts(pluralStem(normalizedA)) ===
    foldUmlauts(pluralStem(normalizedB))
  );
}

/**
 * Count documents per collection from the family's document categories.
 * Matching uses the canonical categoriesMatch predicate; counting happens
 * client-side so one query serves the whole list.
 */
export function countDocumentsPerCollection(
  collections: Pick<Collection, "id" | "name">[],
  categories: (string | null)[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const category of categories) {
    if (!category) continue;
    for (const collection of collections) {
      if (categoriesMatch(category, collection.name)) {
        counts.set(collection.id, (counts.get(collection.id) ?? 0) + 1);
      }
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** PostgREST page size — matches the default server-side row cap. */
export const COLLECTIONS_PAGE_SIZE = 1000;

/**
 * Collects every row of a query by paging until a short page arrives.
 * PostgREST silently caps responses, so a single un-ranged query would
 * truncate large families' data (wrong counts, missing documents).
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = COLLECTIONS_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
    from += pageSize;
  }
}

/** The family's collections, sorted by sort_order (then creation). */
export async function fetchCollections(familyId: string): Promise<Collection[]> {
  return fetchAllRows(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("collections")
      .select("id, family_id, name, icon, color, sort_order, created_at")
      .eq("family_id", familyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      // Unique tiebreaker so rows cannot cross page boundaries between
      // paged requests (duplicates/omissions otherwise).
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Collection[];
  });
}

/**
 * Every non-empty document category of the family. The list screen turns
 * these into per-collection counts with countDocumentsPerCollection.
 */
export async function fetchDocumentCategories(
  familyId: string,
): Promise<(string | null)[]> {
  const rows = await fetchAllRows(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("documents")
      .select("category")
      .eq("family_id", familyId)
      .not("category", "is", null)
      // Unique order — paged reads need it to be stable (see above).
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as { category: string | null }[];
  });
  return rows.map((row) => row.category);
}

/** A document row as the collection detail list needs it. */
export type CollectionDocument = {
  id: string;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  document_type: string | null;
  status: string;
  created_at: string;
};

/**
 * Documents whose category canonically matches the collection name (the
 * Beziehung). PostgREST cannot express German plural/umlaut stemming, so
 * membership is decided client-side with categoriesMatch — the same
 * predicate the web contract mandates for every collection-linking
 * surface. The family's documents are paged in stable id order and
 * filtered; the server-side newest-first order survives the filter.
 */
export async function fetchCollectionDocuments(
  familyId: string,
  collectionName: string,
): Promise<CollectionDocument[]> {
  const rows = await fetchAllRows(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("documents")
      .select(
        "id, title, original_filename, mime_type, document_type, status, created_at, category",
      )
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      // Unique tiebreaker so rows cannot cross page boundaries between
      // paged requests (duplicates/omissions otherwise).
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as (CollectionDocument & { category: string | null })[];
  });
  return rows
    .filter((row) => row.category != null && categoriesMatch(row.category, collectionName))
    .map(({ category: _category, ...document }) => document);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** Create a new collection for the family. */
export async function createCollection(
  familyId: string,
  input: CollectionInput,
): Promise<CollectionResult> {
  const validation = validateCollectionInput(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const { data, error } = await getSupabase()
    .from("collections")
    .insert({
      family_id: familyId,
      name: validation.data.name,
      icon: validation.data.icon,
      color: validation.data.color,
    })
    .select("id, family_id, name, icon, color, sort_order, created_at")
    .single();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      return { success: false, error: DUPLICATE_ERROR };
    }
    return { success: false, error: FRIENDLY_ERROR };
  }
  return { success: true, collection: data as Collection };
}

/**
 * Update an existing collection (rename, or change icon/color).
 *
 * When the name changes, documents whose `category` matched the OLD name
 * are updated to the NEW name (best-effort) — the link is by name, not
 * by ID, so the collection would otherwise lose its contents.
 */
export async function updateCollection(
  collection: Pick<Collection, "id" | "family_id" | "name">,
  input: CollectionInput,
): Promise<CollectionResult> {
  const validation = validateCollectionInput(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const nameChanged = !categoriesMatch(collection.name, validation.data.name);

  const { data, error } = await getSupabase()
    .from("collections")
    .update({
      name: validation.data.name,
      icon: validation.data.icon,
      color: validation.data.color,
    })
    .eq("id", collection.id)
    .select("id, family_id, name, icon, color, sort_order, created_at")
    .single();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      return { success: false, error: DUPLICATE_ERROR };
    }
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Cascade the rename onto matching documents so the collection keeps
  // its contents (best-effort — the collection itself is already renamed
  // even if this secondary update fails). Every STORED spelling that
  // canonically matches the old name is rewritten, not just exact case
  // matches — otherwise "Rechnung" documents would silently fall out of
  // a renamed "Rechnungen" collection.
  if (nameChanged) {
    const storedCategories = await fetchDocumentCategories(collection.family_id);
    const spellings = [
      ...new Set(
        storedCategories.filter(
          (category): category is string =>
            category != null && categoriesMatch(category, collection.name),
        ),
      ),
    ];
    if (spellings.length > 0) {
      await getSupabase()
        .from("documents")
        .update({ category: validation.data.name })
        .eq("family_id", collection.family_id)
        .in("category", spellings);
    }
  }

  return { success: true, collection: data as Collection };
}

/**
 * Delete a collection. Only removes the folder — documents keep their
 * `category` value untouched, so they still surface in the Ablage.
 */
export async function deleteCollection(
  collectionId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await getSupabase()
    .from("collections")
    .delete()
    .eq("id", collectionId);
  if (error) return { success: false, error: FRIENDLY_ERROR };
  return { success: true };
}
