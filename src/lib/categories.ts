/**
 * Category canonicalization.
 *
 * Categories are free text, and collections are linked to documents via
 * `documents.category === collection.name` — so category drift ("Rechnung"
 * vs "Rechnungen" vs "rechnungen") both clutters the category list AND
 * breaks the collection link. This module snaps a suggested category to
 * the family's existing canonical spelling at the moment of truth
 * (analyze + confirm), preferring collection names so LLM-suggested
 * categories automatically land documents in the user's collections.
 */

/**
 * Normalize a category for comparison: lowercase, trimmed, collapsed
 * whitespace.
 */
function normalize(value: string): string {
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

/** Whether two normalized categories refer to the same thing. */
function matches(a: string, b: string): boolean {
  if (a === b) return true;
  return foldUmlauts(pluralStem(a)) === foldUmlauts(pluralStem(b));
}

/**
 * Snap a suggested category to the family's canonical spelling.
 *
 * Match priority:
 *   1. Collection names — a match here means the document automatically
 *      appears inside that collection (documents.category === name).
 *   2. Existing document categories — reuse the established spelling.
 *   3. No match — return the cleaned suggestion as a genuinely new category.
 *
 * @param suggested - The (LLM- or user-) suggested category.
 * @param existingCategories - The family's current distinct categories.
 * @param collectionNames - The family's collection names.
 * @returns The canonical category string (never empty when input isn't).
 */
export function canonicalizeCategory(
  suggested: string,
  existingCategories: string[],
  collectionNames: string[] = [],
): string {
  const cleaned = suggested.trim().replace(/\s+/g, " ");
  if (!cleaned) return cleaned;

  const target = normalize(cleaned);

  for (const name of collectionNames) {
    if (matches(normalize(name), target)) return name;
  }
  for (const category of existingCategories) {
    if (matches(normalize(category), target)) return category;
  }

  return cleaned;
}
