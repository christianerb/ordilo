import { describe, it, expect } from "vitest";
import {
  formatGermanDate,
  toDateInputValue,
  getDaysUntilBirthday,
  isBirthdayToday,
} from "@/lib/format";

// ---------------------------------------------------------------------------
// formatGermanDate
// ---------------------------------------------------------------------------

describe("formatGermanDate", () => {
  it("formats a valid ISO date as DD.MM.YYYY", () => {
    expect(formatGermanDate("2018-03-12")).toBe("12.03.2018");
  });

  it("formats a date with single-digit day and month with leading zeros", () => {
    expect(formatGermanDate("2020-01-05")).toBe("05.01.2020");
  });

  it("formats a date at the start of the year", () => {
    expect(formatGermanDate("2000-01-01")).toBe("01.01.2000");
  });

  it("formats a date at the end of the year", () => {
    expect(formatGermanDate("1999-12-31")).toBe("31.12.1999");
  });

  it("returns null for null input", () => {
    expect(formatGermanDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatGermanDate("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(formatGermanDate(undefined)).toBeNull();
  });

  it("returns null for an invalid date string", () => {
    expect(formatGermanDate("not-a-date")).toBeNull();
  });

  it("returns null for a malformed date (missing parts)", () => {
    expect(formatGermanDate("2018-03")).toBeNull();
  });

  it("preserves the date as-is (no timezone shift)", () => {
    // The date should not be shifted by timezone — it's a pure string format.
    expect(formatGermanDate("1985-06-15")).toBe("15.06.1985");
  });

  it("strips a time component from an ISO datetime string", () => {
    expect(formatGermanDate("2026-07-15T18:00:00")).toBe("15.07.2026");
  });

  it("strips a space-separated time component", () => {
    expect(formatGermanDate("2026-07-15 18:00:00")).toBe("15.07.2026");
  });
});

// ---------------------------------------------------------------------------
// toDateInputValue
// ---------------------------------------------------------------------------

describe("toDateInputValue", () => {
  it("strips a time component from an ISO datetime string", () => {
    expect(toDateInputValue("2026-07-15T18:00:00")).toBe("2026-07-15");
  });

  it("strips a space-separated time component", () => {
    expect(toDateInputValue("2026-07-15 18:00:00")).toBe("2026-07-15");
  });

  it("returns a plain yyyy-MM-dd date unchanged", () => {
    expect(toDateInputValue("2026-07-15")).toBe("2026-07-15");
  });

  it("handles a date at the start of the year", () => {
    expect(toDateInputValue("2000-01-01")).toBe("2000-01-01");
  });

  it("handles a date at the end of the year", () => {
    expect(toDateInputValue("1999-12-31")).toBe("1999-12-31");
  });

  it("returns empty string for null input", () => {
    expect(toDateInputValue(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(toDateInputValue("")).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toDateInputValue(undefined)).toBe("");
  });

  it("returns empty string for an invalid date string", () => {
    expect(toDateInputValue("not-a-date")).toBe("");
  });

  it("returns empty string for a partial date", () => {
    expect(toDateInputValue("2026-07")).toBe("");
  });

  it("returns empty string for a date with non-numeric parts", () => {
    expect(toDateInputValue("20ab-07-15")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getDaysUntilBirthday
// ---------------------------------------------------------------------------

describe("getDaysUntilBirthday", () => {
  // We can't hardcode "today" — use the current date to build test cases.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  it("returns 0 when the birthday is today", () => {
    // Use a different birth year but same month/day.
    expect(getDaysUntilBirthday(`1990-${month}-${day}`)).toBe(0);
  });

  it("returns 1 when the birthday is tomorrow", () => {
    const tomorrow = new Date(year, now.getMonth(), now.getDate() + 1, 12, 0, 0);
    const tMonth = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const tDay = String(tomorrow.getDate()).padStart(2, "0");
    expect(getDaysUntilBirthday(`1990-${tMonth}-${tDay}`)).toBe(1);
  });

  it("returns a positive number for a birthday in the future", () => {
    // Birthday in 30 days from now.
    const future = new Date(year, now.getMonth(), now.getDate() + 30, 12, 0, 0);
    const fMonth = String(future.getMonth() + 1).padStart(2, "0");
    const fDay = String(future.getDate()).padStart(2, "0");
    expect(getDaysUntilBirthday(`1990-${fMonth}-${fDay}`)).toBe(30);
  });

  it("wraps to next year when the birthday has passed", () => {
    // Birthday yesterday — should be ~364 days until next occurrence.
    const yesterday = new Date(year, now.getMonth(), now.getDate() - 1, 12, 0, 0);
    const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
    const yDay = String(yesterday.getDate()).padStart(2, "0");
    const result = getDaysUntilBirthday(`1990-${yMonth}-${yDay}`);
    expect(result).toBeGreaterThan(360);
    expect(result).toBeLessThan(366);
  });

  it("returns null for null input", () => {
    expect(getDaysUntilBirthday(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getDaysUntilBirthday("")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(getDaysUntilBirthday("not-a-date")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isBirthdayToday
// ---------------------------------------------------------------------------

describe("isBirthdayToday", () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  it("returns true when the birthday is today (different birth year)", () => {
    expect(isBirthdayToday(`1990-${month}-${day}`)).toBe(true);
  });

  it("returns false when the birthday is not today", () => {
    expect(isBirthdayToday("1990-01-15")).toBe(month === "01" && day === "15");
  });

  it("returns false for null input", () => {
    expect(isBirthdayToday(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isBirthdayToday("")).toBe(false);
  });
});
