import { describe, it, expect } from "vitest";
import {
  chatRequestSchema,
  NO_RESULTS_FALLBACK,
  FORBIDDEN_HEDGING_PHRASES,
  containsHedgingLanguage,
} from "@/lib/schemas/chat";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// chatRequestSchema
// ---------------------------------------------------------------------------

describe("chatRequestSchema", () => {
  it("accepts a valid request with message and family_id", () => {
    const result = chatRequestSchema.safeParse({
      message: "Zeig mir alle Briefe zur Einschulung von Emma",
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe(
        "Zeig mir alle Briefe zur Einschulung von Emma",
      );
      expect(result.data.family_id).toBe(VALID_FAMILY_ID);
    }
  });

  it("rejects a missing message", () => {
    const result = chatRequestSchema.safeParse({
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty message", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only message", () => {
    const result = chatRequestSchema.safeParse({
      message: "   ",
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(false);
  });

  it("trims whitespace from the message", () => {
    const result = chatRequestSchema.safeParse({
      message: "  Was muss ich erledigen?  ",
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Was muss ich erledigen?");
    }
  });

  it("rejects a missing family_id", () => {
    const result = chatRequestSchema.safeParse({
      message: "Welche Fristen laufen bald ab?",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty family_id", () => {
    const result = chatRequestSchema.safeParse({
      message: "Welche Fristen laufen bald ab?",
      family_id: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID family_id", () => {
    const result = chatRequestSchema.safeParse({
      message: "Welche Fristen laufen bald ab?",
      family_id: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a malformed UUID", () => {
    const result = chatRequestSchema.safeParse({
      message: "test",
      family_id: "660e8400-e29b-41d4-a716", // too short
    });

    expect(result.success).toBe(false);
  });

  it("accepts umlauts and special characters in message", () => {
    const result = chatRequestSchema.safeParse({
      message: "Zeig mir Dokumente von Müller & Söhne mit \"Anführungszeichen\"",
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toContain("Müller");
      expect(result.data.message).toContain('"Anführungszeichen"');
    }
  });

  it("accepts a long message", () => {
    const longMessage = "A".repeat(10000);
    const result = chatRequestSchema.safeParse({
      message: longMessage,
      family_id: VALID_FAMILY_ID,
    });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NO_RESULTS_FALLBACK
// ---------------------------------------------------------------------------

describe("NO_RESULTS_FALLBACK", () => {
  it("is the exact German fallback string", () => {
    expect(NO_RESULTS_FALLBACK).toBe("Ich finde dazu kein Dokument.");
  });
});

// ---------------------------------------------------------------------------
// FORBIDDEN_HEDGING_PHRASES
// ---------------------------------------------------------------------------

describe("FORBIDDEN_HEDGING_PHRASES", () => {
  it("contains all four forbidden phrases", () => {
    expect(FORBIDDEN_HEDGING_PHRASES).toContain("Ich glaube");
    expect(FORBIDDEN_HEDGING_PHRASES).toContain("Vermutlich");
    expect(FORBIDDEN_HEDGING_PHRASES).toContain("Wahrscheinlich");
    expect(FORBIDDEN_HEDGING_PHRASES).toContain("Könnte sein");
  });

  it("has exactly four phrases", () => {
    expect(FORBIDDEN_HEDGING_PHRASES).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// containsHedgingLanguage
// ---------------------------------------------------------------------------

describe("containsHedgingLanguage", () => {
  it("detects 'Ich glaube'", () => {
    expect(containsHedgingLanguage("Ich glaube, das ist ein Brief.")).toBe(true);
  });

  it("detects 'Vermutlich'", () => {
    expect(containsHedgingLanguage("Vermutlich ist das eine Rechnung.")).toBe(true);
  });

  it("detects 'Wahrscheinlich'", () => {
    expect(
      containsHedgingLanguage("Wahrscheinlich muss man das bis morgen erledigen."),
    ).toBe(true);
  });

  it("detects 'Könnte sein'", () => {
    expect(containsHedgingLanguage("Könnte sein, dass das für Emma ist.")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsHedgingLanguage("ich glaube das ist ein brief")).toBe(true);
    expect(containsHedgingLanguage("VERMUTLICH ist das richtig")).toBe(true);
  });

  it("returns false for clean, declarative text", () => {
    expect(
      containsHedgingLanguage(
        "Laut dem Kita-Brief wird Emma am 15. August eingeschult.",
      ),
    ).toBe(false);
  });

  it("returns false for the fallback string", () => {
    expect(containsHedgingLanguage(NO_RESULTS_FALLBACK)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsHedgingLanguage("")).toBe(false);
  });

  it("detects hedging language within a longer sentence", () => {
    expect(
      containsHedgingLanguage(
        "Das Dokument ist eine Rechnung. Ich glaube, der Betrag ist 45 Euro.",
      ),
    ).toBe(true);
  });
});
