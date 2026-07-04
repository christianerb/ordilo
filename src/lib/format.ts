/**
 * Formatting utilities for user-facing text.
 */

/**
 * Format an ISO date string (YYYY-MM-DD) as a German date (DD.MM.YYYY).
 *
 * This is a pure string-based formatter — it does not construct a Date
 * object, so there is no risk of timezone shifting the day. Used for
 * displaying birthdates and other dates in the German-friendly format
 * required by the design system.
 *
 * @param iso - An ISO date string (YYYY-MM-DD) or null/undefined.
 * @returns The formatted German date (DD.MM.YYYY), or null when input is
 *          null, empty, or not a valid YYYY-MM-DD string.
 *
 * @example
 * formatGermanDate("2018-03-12") // → "12.03.2018"
 * formatGermanDate(null)         // → null
 * formatGermanDate("not-a-date") // → null
 */
export function formatGermanDate(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;

  const parts = iso.split("-");
  if (parts.length !== 3) return null;

  const [year, month, day] = parts;
  // Validate that all parts are numeric and have the expected lengths.
  if (
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^\d{2}$/.test(day)
  ) {
    return null;
  }

  return `${day}.${month}.${year}`;
}
