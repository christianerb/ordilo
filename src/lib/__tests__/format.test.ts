import { describe, it, expect } from "vitest";
import { formatGermanDate } from "@/lib/format";

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
});
