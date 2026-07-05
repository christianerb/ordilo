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
 * Accepts both plain date strings (`YYYY-MM-DD`) and ISO datetime strings
 * (`YYYY-MM-DDTHH:mm:ss`); any time component is stripped before
 * formatting.
 *
 * @param iso - An ISO date or datetime string, or null/undefined.
 * @returns The formatted German date (DD.MM.YYYY), or null when input is
 *          null, empty, or not a valid YYYY-MM-DD string.
 *
 * @example
 * formatGermanDate("2018-03-12")              // → "12.03.2018"
 * formatGermanDate("2026-07-15T18:00:00")     // → "15.07.2026"
 * formatGermanDate(null)                      // → null
 * formatGermanDate("not-a-date")              // → null
 */
export function formatGermanDate(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;

  // Strip any time component (e.g. "2026-07-15T18:00:00" → "2026-07-15").
  const dateOnly = iso.split(/[T ]/)[0];

  const parts = dateOnly.split("-");
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

/**
 * Normalize a date or datetime string to the `yyyy-MM-dd` format required
 * by native `<input type="date">` controls.
 *
 * A native date input emits a console warning when its `value` prop
 * contains a time component (e.g. `2026-07-15T18:00:00`). This helper
 * strips any time component and validates the result so the bound value
 * is always a clean `yyyy-MM-dd` string (or empty string for invalid /
 * null input), preventing the warning.
 *
 * @param value - A date string (`yyyy-MM-dd`), ISO datetime
 *                (`yyyy-MM-ddTHH:mm:ss`), or null/undefined/empty.
 * @returns The `yyyy-MM-dd` date portion, or an empty string when the
 *          input is null, empty, or does not contain a valid date prefix.
 *
 * @example
 * toDateInputValue("2026-07-15T18:00:00")  // → "2026-07-15"
 * toDateInputValue("2026-07-15")           // → "2026-07-15"
 * toDateInputValue(null)                   // → ""
 * toDateInputValue("")                     // → ""
 * toDateInputValue("not-a-date")           // → ""
 */
export function toDateInputValue(
  value: string | null | undefined,
): string {
  if (!value) return "";

  // Strip any time component (e.g. "2026-07-15T18:00:00" → "2026-07-15").
  const dateOnly = value.split(/[T ]/)[0];

  // Validate the result is a proper yyyy-MM-dd string.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return "";

  return dateOnly;
}
