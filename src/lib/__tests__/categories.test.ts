import { describe, it, expect } from "vitest";
import { canonicalizeCategory } from "@/lib/categories";

describe("canonicalizeCategory", () => {
  it("returns the input unchanged when nothing matches", () => {
    expect(canonicalizeCategory("Steuer", ["Rechnungen"], [])).toBe("Steuer");
  });

  it("snaps case variants to the existing spelling", () => {
    expect(canonicalizeCategory("rechnungen", ["Rechnungen"], [])).toBe(
      "Rechnungen",
    );
  });

  it("folds singular/plural onto the existing category", () => {
    expect(canonicalizeCategory("Rechnung", ["Rechnungen"], [])).toBe(
      "Rechnungen",
    );
    expect(canonicalizeCategory("Verträge", ["Vertrag"], [])).toBe("Vertrag");
  });

  it("prefers collection names over plain categories", () => {
    expect(
      canonicalizeCategory("rechnung", ["Rechnung"], ["Rechnungen"]),
    ).toBe("Rechnungen");
  });

  it("collapses whitespace in new categories", () => {
    expect(canonicalizeCategory("  Kita   Briefe ", [], [])).toBe(
      "Kita Briefe",
    );
  });

  it("does not fold short words", () => {
    // "Kfz" must not be stemmed into something else.
    expect(canonicalizeCategory("Kfz", ["Kita"], [])).toBe("Kfz");
  });
});
