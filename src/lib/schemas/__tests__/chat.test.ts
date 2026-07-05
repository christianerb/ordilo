import { describe, it, expect } from "vitest";
import {
  chatRequestSchema,
  NO_RESULTS_FALLBACK,
  FORBIDDEN_HEDGING_PHRASES,
  containsHedgingLanguage,
  answerCitesSources,
  FAIL_CLOSED_HEDGING,
  FAIL_CLOSED_CITATION,
  MIN_CITATION_TITLE_LENGTH,
  type ChatSource,
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

// ---------------------------------------------------------------------------
// Fail-closed constants
// ---------------------------------------------------------------------------

describe("FAIL_CLOSED constants", () => {
  it("FAIL_CLOSED_HEDGING is a non-empty German string", () => {
    expect(FAIL_CLOSED_HEDGING.length).toBeGreaterThan(10);
    expect(FAIL_CLOSED_HEDGING).toContain("Bitte");
  });

  it("FAIL_CLOSED_CITATION is a non-empty German string", () => {
    expect(FAIL_CLOSED_CITATION.length).toBeGreaterThan(10);
    expect(FAIL_CLOSED_CITATION.toLowerCase()).toContain("quelle");
  });

  it("fail-closed messages do not contain hedging language", () => {
    expect(containsHedgingLanguage(FAIL_CLOSED_HEDGING)).toBe(false);
    expect(containsHedgingLanguage(FAIL_CLOSED_CITATION)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// answerCitesSources
// ---------------------------------------------------------------------------

describe("answerCitesSources", () => {
  function source(
    title: string | null,
    docId = "doc-1",
  ): ChatSource {
    return {
      document_id: docId,
      title,
      excerpt: "Inhalt",
      score: 0.9,
    };
  }

  it("returns true when the answer contains a source title", () => {
    const answer = "Laut dem Kita-Brief wird Emma am 15. August eingeschult.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief")]),
    ).toBe(true);
  });

  it("returns false when the answer does not contain any source title", () => {
    const answer = "Die Einschulung findet am 15. August statt.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief")]),
    ).toBe(false);
  });

  it("returns true when the answer is the no-results fallback", () => {
    expect(
      answerCitesSources(NO_RESULTS_FALLBACK, [source("Kita-Brief")]),
    ).toBe(true);
  });

  it("returns true when no sources are provided (empty array)", () => {
    expect(answerCitesSources("Irgendeine Antwort", [])).toBe(true);
  });

  it("returns true when all source titles are null (cannot verify)", () => {
    expect(
      answerCitesSources("Irgendeine Antwort", [source(null), source(null)]),
    ).toBe(true);
  });

  it("returns true when all source titles are shorter than MIN_CITATION_TITLE_LENGTH", () => {
    expect(
      answerCitesSources("Antwort ohne Nennung", [source("T"), source("A")]),
    ).toBe(true);
  });

  it("is case-insensitive when matching titles", () => {
    const answer = "laut dem kita-brief wird emma eingeschult.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief")]),
    ).toBe(true);
  });

  it("handles German umlauts in titles", () => {
    const answer = "Laut der Stromrechnung Müller & Söhne beträgt der Betrag 45 €.";
    expect(
      answerCitesSources(answer, [source("Stromrechnung Müller & Söhne")]),
    ).toBe(true);
  });

  it("returns true if at least one of multiple titles is referenced", () => {
    const answer = "Laut dem Kita-Brief findet die Einschulung statt.";
    expect(
      answerCitesSources(answer, [
        source("Stromrechnung"),
        source("Kita-Brief"),
      ]),
    ).toBe(true);
  });

  it("returns false when none of multiple checkable titles are referenced", () => {
    const answer = "Der Termin ist am 15. August.";
    expect(
      answerCitesSources(answer, [
        source("Stromrechnung"),
        source("Kita-Brief"),
      ]),
    ).toBe(false);
  });

  it("ignores null titles but still checks non-null ones", () => {
    const answer = "Ein Brief ohne Titelreferenz.";
    expect(
      answerCitesSources(answer, [source(null), source("Kita-Brief")]),
    ).toBe(false);
  });

  it("MIN_CITATION_TITLE_LENGTH is 3", () => {
    expect(MIN_CITATION_TITLE_LENGTH).toBe(3);
  });

  it("treats the fallback as cited even when titles exist", () => {
    expect(
      answerCitesSources(NO_RESULTS_FALLBACK, [
        source("Kita-Brief"),
        source("Stromrechnung"),
      ]),
    ).toBe(true);
  });
});
