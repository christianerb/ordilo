import { describe, it, expect } from "vitest";
import { formatGermanDate, toDateInputValue } from "@/lib/format";

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
