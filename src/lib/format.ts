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
 * Calculate how many days until the next occurrence of a birthday.
 *
 * Uses the birthdate's month/day against the current date. Returns 0 when
 * the birthday is today. Returns null when the birthdate is invalid or
 * in the future (which shouldn't happen for a birthdate, but guards anyway).
 *
 * Timezone-safe: parses the ISO date string manually instead of using
 * `new Date()` to avoid UTC offsets shifting the day.
 *
 * @param iso - An ISO date string (YYYY-MM-DD), or null/undefined.
 * @returns Days until next birthday (0 = today), or null when invalid.
 */
export function getDaysUntilBirthday(
  iso: string | null | undefined,
): number | null {
  if (!iso) return null;

  const dateOnly = iso.split(/[T ]/)[0];
  const parts = dateOnly.split("-");
  if (parts.length !== 3) return null;

  const [birthYear, birthMonth, birthDay] = parts.map(Number);
  if (!birthYear || !birthMonth || !birthDay) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JS months are 0-based
  const currentDay = now.getDate();

  // Calculate the next occurrence of the birthday.
  let nextYear = currentYear;
  // If the birthday already passed this year, next occurrence is next year.
  if (birthMonth < currentMonth || (birthMonth === currentMonth && birthDay < currentDay)) {
    nextYear = currentYear + 1;
  }

  // Build dates using noon to avoid DST edge cases.
  const today = new Date(currentYear, currentMonth - 1, currentDay, 12, 0, 0);
  const nextBirthday = new Date(nextYear, birthMonth - 1, birthDay, 12, 0, 0);

  const diffMs = nextBirthday.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 ? diffDays : null;
}

/**
 * Check if a birthdate is today (ignoring the year).
 *
 * @param iso - An ISO date string (YYYY-MM-DD), or null/undefined.
 * @returns true when the birthday is today, false otherwise.
 */
export function isBirthdayToday(
  iso: string | null | undefined,
): boolean {
  return getDaysUntilBirthday(iso) === 0;
}

/**
 * Format an ISO timestamp as a human-readable relative time in German.
 *
 * Produces strings like "gerade eben", "vor 2 Stunden", "vor 3 Tagen",
 * or a `DD.MM.YYYY` date for anything older than a week.
 *
 * The `compact` flag switches the minute and hour units to their
 * abbreviated forms ("Min" / "Std") for space-constrained surfaces such
 * as bento tiles. Days and the absolute-date fallback are identical in
 * both modes.
 *
 * @param iso - An ISO datetime string, or null/undefined.
 * @param compact - When true, use abbreviated units ("Min", "Std").
 * @returns The formatted relative time, or null when input is null,
 *          empty, or not a valid date.
 *
 * @example
 * formatRelativeTime("2026-07-07T10:00:00Z")           // → "vor 2 Stunden"
 * formatRelativeTime("2026-07-07T10:00:00Z", true)      // → "vor 2 Std"
 * formatRelativeTime(null)                              // → null
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  compact = false,
): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "gerade eben";
  if (diffMinutes < 60) {
    if (compact) return `vor ${diffMinutes} Min`;
    return `vor ${diffMinutes} Minute${diffMinutes === 1 ? "" : "n"}`;
  }
  if (diffHours < 24) {
    if (compact) return `vor ${diffHours} Std`;
    return `vor ${diffHours} Stunde${diffHours === 1 ? "" : "n"}`;
  }
  if (diffDays < 7) return `vor ${diffDays} Tag${diffDays === 1 ? "" : "en"}`;

  // For older dates, show DD.MM.YYYY
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
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
