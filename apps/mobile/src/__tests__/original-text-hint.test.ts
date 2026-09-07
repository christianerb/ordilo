import { findOriginalTextMatch } from "../lib/original-text-hint";

describe("findOriginalTextMatch", () => {
  it("shows the original paragraph while tolerating case and OCR whitespace", () => {
    expect(findOriginalTextMatch("Kopf\n\nFür ANNA\n  Müller gilt dieser Vertrag.\n\nFuß", "Anna Müller")).toEqual({
      kind: "match", excerpt: "Für ANNA\n  Müller gilt dieser Vertrag.", clippedBefore: true, clippedAfter: true,
    });
  });
  it("matches a German date from an ISO value without rewriting the original", () => {
    expect(findOriginalTextMatch("Bitte bis 3.9.2026 bezahlen.", "2026-09-03")).toEqual({
      kind: "match", excerpt: "Bitte bis 3.9.2026 bezahlen.", clippedBefore: false, clippedAfter: false,
    });
  });
  it("declines repeated values even within a single paragraph", () => {
    expect(findOriginalTextMatch("Anna überweist an Anna.", "Anna")).toEqual({ kind: "ambiguous" });
    expect(findOriginalTextMatch("2026-09-03 oder 03.09.2026", "2026-09-03")).toEqual({ kind: "ambiguous" });
  });
  it("does not match substrings of another person, amount or identifier", () => {
    expect(findOriginalTextMatch("Annabelle", "Anna")).toEqual({ kind: "missing" });
    expect(findOriginalTextMatch("12340", "1234")).toEqual({ kind: "missing" });
    expect(findOriginalTextMatch("AB1234CD", "1234")).toEqual({ kind: "missing" });
  });
  it("treats regex metacharacters as literal content", () => {
    expect(findOriginalTextMatch("Betrag 12,50 € (inkl. MwSt.)", "12,50 € (inkl. MwSt.)").kind).toBe("match");
    expect(findOriginalTextMatch("Rechnung Ax12", "A.12")).toEqual({ kind: "missing" });
  });
  it("declines missing OCR, empty values and values absent from the source", () => {
    expect(findOriginalTextMatch(null, "Anna")).toEqual({ kind: "missing" });
    expect(findOriginalTextMatch("Brief", " ")).toEqual({ kind: "missing" });
    expect(findOriginalTextMatch("Brief", "Korrektur")).toEqual({ kind: "missing" });
  });
  it("bounds a long OCR paragraph and preserves actual source characters", () => {
    const text = `${"Vorwort ".repeat(100)}Einmaliger Wert${" Nachsatz".repeat(100)}`;
    const result = findOriginalTextMatch(text, "Einmaliger Wert");
    expect(result.kind).toBe("match");
    if (result.kind !== "match") throw new Error("Expected match");
    expect(result.excerpt.length).toBeLessThanOrEqual(335);
    expect(text.includes(result.excerpt)).toBe(true);
    expect(result.clippedBefore && result.clippedAfter).toBe(true);
  });
});
