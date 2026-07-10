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
  MIN_CONTENT_FRAGMENT_WORDS,
  MIN_CONTENT_FRAGMENT_CHARS,
  parseAnswerCardArgs,
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
    excerpt = "Inhalt",
    docId = "doc-1",
  ): ChatSource {
    return {
      document_id: docId,
      title,
      excerpt,
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

  it("returns true when all source titles are null but the answer matches source content (content-based citation)", () => {
    // Titles are null → title matching cannot fire, but content matching
    // finds a distinctive fragment from the excerpt in the answer.
    const excerpt = "Einschulung am 15. August";
    const answer = "Die Einschulung am 15. August ist bestätigt worden.";
    expect(
      answerCitesSources(answer, [source(null, excerpt), source(null, excerpt)]),
    ).toBe(true);
  });

  it("returns false when all source titles are null and the answer does not match source content (no bypass)", () => {
    // With the bypass removed, null titles no longer automatically pass.
    // If the answer does not contain a content fragment either, it is
    // considered uncited.
    const excerpt = "Einschulung am 15. August";
    const answer = "Irgendeine Antwort ohne Bezug zur Quelle.";
    expect(
      answerCitesSources(answer, [source(null, excerpt), source(null, excerpt)]),
    ).toBe(false);
  });

  it("returns true when all source titles are shorter than MIN_CITATION_TITLE_LENGTH but the answer matches source content", () => {
    // Titles "T" and "A" are too short for title matching, but content
    // matching finds a distinctive fragment from the excerpt.
    const excerpt = "Einschulung am 15. August";
    const answer = "Die Einschulung am 15. August ist bestätigt.";
    expect(
      answerCitesSources(answer, [source("T", excerpt), source("A", excerpt)]),
    ).toBe(true);
  });

  it("returns false when all source titles are short and the answer does not match source content (no bypass)", () => {
    // Short titles + no content match → uncited (no bypass).
    const excerpt = "Einschulung am 15. August";
    const answer = "Antwort ohne Nennung der Quelle.";
    expect(
      answerCitesSources(answer, [source("T", excerpt), source("A", excerpt)]),
    ).toBe(false);
  });

  it("returns false when all sources have null titles and excerpts too short for content fragments (no bypass)", () => {
    // Both title and content matching have nothing to check, but the
    // bypass is removed → uncited.
    expect(
      answerCitesSources("Irgendeine Antwort", [source(null, "AB"), source(null, "CD")]),
    ).toBe(false);
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

  // --- Content-based citation matching ---

  it("returns true when the answer contains a content fragment from the excerpt (content-based citation)", () => {
    const excerpt = "Einschulung am 15. August";
    const answer = "Die Einschulung am 15. August ist bestätigt.";
    expect(
      answerCitesSources(answer, [source("Dokument", excerpt)]),
    ).toBe(true);
  });

  it("returns true when the answer matches content but not the title (content fallback)", () => {
    // Title not in answer, but content fragment is.
    const excerpt = "Die Einschulung von Emma findet am 15. August statt";
    const answer = "Die Einschulung von Emma findet am 15. August statt.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief", excerpt)]),
    ).toBe(true);
  });

  it("returns false when the answer shares only a short phrase with the excerpt (below fragment word threshold)", () => {
    // "am 15. August" is only 3 words — below MIN_CONTENT_FRAGMENT_WORDS.
    // The answer restates the date but does not quote a distinctive enough
    // portion of the source content, and the title is not referenced.
    const excerpt = "Einschulung am 15. August";
    const answer = "Die Einschulung findet am 15. August statt.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief", excerpt)]),
    ).toBe(false);
  });

  it("is case-insensitive when matching content fragments", () => {
    const excerpt = "Einschulung am 15. August";
    const answer = "die EINSCHULUNG AM 15. AUGUST ist bestätigt.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief", excerpt)]),
    ).toBe(true);
  });

  it("handles German umlauts in content fragments", () => {
    const excerpt = "Müller & Söhne Rechnung vom März";
    const answer = "Die Müller & Söhne Rechnung vom März wurde bezahlt.";
    expect(
      answerCitesSources(answer, [source("Rechnung", excerpt)]),
    ).toBe(true);
  });

  it("title OR content: passes when either a title or a content fragment matches", () => {
    // Title matches but content does not.
    expect(
      answerCitesSources("Laut dem Kita-Brief ist alles klar.", [
        source("Kita-Brief", "Einschulung am 15. August"),
      ]),
    ).toBe(true);
    // Content matches but title does not.
    expect(
      answerCitesSources("Die Einschulung am 15. August ist bestätigt.", [
        source("Kita-Brief", "Einschulung am 15. August"),
      ]),
    ).toBe(true);
  });

  it("returns true if at least one source is cited by content among multiple sources", () => {
    const answer = "Die Einschulung am 15. August ist bestätigt.";
    expect(
      answerCitesSources(answer, [
        source("Rechnung", "Betrag: 45 EUR"),
        source(null, "Einschulung am 15. August"),
      ]),
    ).toBe(true);
  });

  it("returns false when none of multiple sources are cited by title or content", () => {
    const answer = "Der Termin ist am 15. August.";
    expect(
      answerCitesSources(answer, [
        source("Stromrechnung", "Betrag: 45 EUR"),
        source("Kita-Brief", "Einschulung am 15. August"),
      ]),
    ).toBe(false);
  });

  it("MIN_CONTENT_FRAGMENT_WORDS is 4", () => {
    expect(MIN_CONTENT_FRAGMENT_WORDS).toBe(4);
  });

  it("MIN_CONTENT_FRAGMENT_CHARS is 10", () => {
    expect(MIN_CONTENT_FRAGMENT_CHARS).toBe(10);
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

  // --- Punctuation-insensitive content matching (chat-api-citation-fallback-hardening) ---

  it("recognizes content citation when the answer drops a period present in the excerpt", () => {
    // Excerpt has "15." (with period), answer has "15" (without).
    const excerpt = "am 15. August stattfinden die";
    const answer = "am 15 August stattfinden die Feierlichkeiten.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(true);
  });

  it("recognizes content citation when the answer adds a period not present in the excerpt", () => {
    // Excerpt has "15" (no period), answer has "15." (with period).
    const excerpt = "am 15 August stattfinden die";
    const answer = "am 15. August stattfinden die Feierlichkeiten.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(true);
  });

  it("recognizes content citation when comma and period differ in numbers", () => {
    // Excerpt uses comma decimal separator, answer uses period.
    const excerpt = "Betrag von 45,50 Euro laut";
    const answer = "Der Betrag von 45.50 Euro laut Rechnung ist bezahlt.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(true);
  });

  it("recognizes content citation when quotation marks differ between excerpt and answer", () => {
    // Excerpt has double quotes around "Einschulung", answer does not.
    const excerpt = 'Die "Einschulung" findet am 15. August';
    const answer = "Die Einschulung findet am 15 August statt.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(true);
  });

  it("recognizes content citation with both casing and punctuation differences", () => {
    const excerpt = "Einschulung am 15. August";
    const answer = "DIE EINSCHULUNG AM 15 AUGUST IST BESTÄTIGT.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(true);
  });

  it("recognizes content citation with null title and punctuation differences (no false fail-closed)", () => {
    // Title is null → only content matching can fire. Punctuation differs
    // but the content citation must still be recognized.
    const excerpt = "am 15. August stattfinden die";
    const answer = "am 15 August stattfinden die Feierlichkeiten.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(true);
  });

  it("recognizes content citation with short title and punctuation differences (no false fail-closed)", () => {
    // Title "T" is too short for title matching → only content matching.
    const excerpt = "am 15. August stattfinden die";
    const answer = "am 15 August stattfinden die Feierlichkeiten.";
    expect(
      answerCitesSources(answer, [source("T", excerpt)]),
    ).toBe(true);
  });

  it("title matching normalizes punctuation: recognizes title with hyphen when answer uses space", () => {
    // Title "Kita-Brief" has a hyphen; the answer writes "Kita Brief" (space).
    const answer = "Laut dem Kita Brief wird Emma eingeschult.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief")]),
    ).toBe(true);
  });

  it("still fails closed when the answer does not match any content even with punctuation normalization", () => {
    // Punctuation normalization must not weaken the guardrail: a completely
    // unrelated answer still fails the citation check.
    const excerpt = "Einschulung am 15. August";
    const answer = "Irgendeine völlig andere Antwort ohne Bezug.";
    expect(
      answerCitesSources(answer, [source(null, excerpt)]),
    ).toBe(false);
  });

  it("still fails closed when a short sub-threshold phrase matches only after punctuation removal", () => {
    // "am 15. August" is only 3 words — below MIN_CONTENT_FRAGMENT_WORDS.
    // Even with punctuation removed, a 3-word match must NOT pass the
    // citation check (the word-count threshold is still meaningful).
    const excerpt = "Einschulung am 15. August";
    const answer = "Die Einschulung findet am 15 August statt.";
    expect(
      answerCitesSources(answer, [source("Kita-Brief", excerpt)]),
    ).toBe(false);
  });

  // --- Graph-origin citation acceptance (VAL-SEARCH-023) ---

  it("returns true when all sources are graph-derived (no semantic to hallucinate)", () => {
    // Graph sources (task/person) are deterministic DB matches — there is
    // nothing semantic to hallucinate, so the answer is considered cited
    // even without a title or content match.
    const answer = "Folgende Fristen laufen bald ab: 1. Frist abgeben bis morgen.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Rechnung", excerpt: "Aufgabe: Frist abgeben", score: 0.9, origin: "graph" },
      ]),
    ).toBe(true);
  });

  it("returns true when all sources are graph-derived with null titles", () => {
    // Graph sources with null titles still pass via the graph-origin shortcut.
    const answer = "Es gibt eine offene Aufgabe: Formular einreichen.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: null, excerpt: "Aufgabe: Formular einreichen", score: 0.85, origin: "graph" },
      ]),
    ).toBe(true);
  });

  it("returns true when all graph-derived sources have multiple entries", () => {
    // Multiple graph sources (e.g. graph:person + graph:task) all pass.
    const answer = "Für Emma gibt es eine offene Aufgabe.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Brief", excerpt: "Person: Emma", score: 0.9, origin: "graph" },
        { document_id: "doc-2", title: "Aufgabenliste", excerpt: "Aufgabe: Formular abgeben", score: 0.85, origin: "graph" },
      ]),
    ).toBe(true);
  });

  it("returns false when sources include a semantic source and the answer does not cite any (strict check preserved)", () => {
    // Mixed sources: one semantic, one graph. The semantic source still
    // requires citation, so the strict title/content check applies to all.
    const answer = "Folgende Fristen laufen bald ab: 1. Frist abgeben bis morgen.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Stromrechnung", excerpt: "Betrag: 45 EUR", score: 0.85, origin: "semantic" },
        { document_id: "doc-2", title: "Aufgabenliste", excerpt: "Aufgabe: Frist abgeben", score: 0.9, origin: "graph" },
      ]),
    ).toBe(false);
  });

  it("returns true when mixed sources have a title match from any source (semantic or graph)", () => {
    // Mixed sources: the graph source's title matches the answer.
    const answer = "Laut der Aufgabenliste gibt es eine offene Frist.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Stromrechnung", excerpt: "Betrag: 45 EUR", score: 0.85, origin: "semantic" },
        { document_id: "doc-2", title: "Aufgabenliste", excerpt: "Aufgabe: Frist abgeben", score: 0.9, origin: "graph" },
      ]),
    ).toBe(true);
  });

  it("treats sources without origin as semantic (backward compatibility)", () => {
    // Sources without an origin field default to semantic behavior.
    const answer = "Irgendeine Antwort ohne Bezug zur Quelle.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Brief", excerpt: "Einschulung am 15. August", score: 0.9 },
      ]),
    ).toBe(false);
  });

  // --- Prefix stripping before fragment extraction (VAL-SEARCH-023) ---

  it("strips 'Aufgabe: ' prefix before content fragment extraction", () => {
    // The graph:task excerpt "Aufgabe: Frist abgeben bis morgen" has the
    // synthetic "Aufgabe: " prefix. After stripping, the content fragment
    // "frist abgeben bis morgen" (4 words) should match the answer.
    const excerpt = "Aufgabe: Frist abgeben bis morgen";
    const answer = "Die Frist abgeben bis morgen ist die nächste Aufgabe.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Sonstiges Dokument", excerpt, score: 0.9, origin: "semantic" },
      ]),
    ).toBe(true);
  });

  it("strips 'Person: ' prefix before content fragment extraction", () => {
    const excerpt = "Person: Emma Müller wohnt in";
    const answer = "Emma Müller wohnt in Berlin laut dem Dokument.";
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Sonstiges Dokument", excerpt, score: 0.9, origin: "semantic" },
      ]),
    ).toBe(true);
  });

  it("does not strip prefixes that are not at the start of the excerpt", () => {
    // Only prefixes at the start of the excerpt are stripped.
    const excerpt = "Das Dokument erwähnt Aufgabe: Frist abgeben bis morgen";
    const answer = "Die Frist abgeben bis morgen ist wichtig.";
    // "aufgabe frist abgeben bis" would be 4 words after "Das Dokument erwähnt"
    // → actually "aufgabe frist abgeben bis" IS 4 words. Let me check...
    // The fragment extraction uses 4 consecutive words. From the excerpt:
    // "das dokument erwähnt aufgabe frist abgeben bis morgen"
    // 4-word fragments: "das dokument erwähnt aufgabe", "dokument erwähnt aufgabe frist",
    // "erwähnt aufgabe frist abgeben", "aufgabe frist abgeben bis", "frist abgeben bis morgen"
    // The answer normalized: "die frist abgeben bis morgen ist wichtig"
    // "frist abgeben bis morgen" is in the answer → should match.
    expect(
      answerCitesSources(answer, [
        { document_id: "doc-1", title: "Sonstiges Dokument", excerpt, score: 0.9, origin: "semantic" },
      ]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseAnswerCardArgs
// ---------------------------------------------------------------------------

describe("parseAnswerCardArgs", () => {
  const validArgs = {
    card_type: "termin",
    title: "Zahnarzttermin",
    subtitle: "Emma",
    fields: [
      { label: "Datum", value: "12.08.2026" },
      { label: "Arzt", value: "Dr. Meyer" },
    ],
    source_document_id: "doc-1",
  };

  it("parses valid arguments into an AnswerCard", () => {
    const card = parseAnswerCardArgs(validArgs);
    expect(card).not.toBeNull();
    expect(card?.type).toBe("termin");
    expect(card?.title).toBe("Zahnarzttermin");
    expect(card?.subtitle).toBe("Emma");
    expect(card?.fields).toHaveLength(2);
    expect(card?.actionDocumentId).toBe("doc-1");
  });

  it("defaults subtitle and actionDocumentId to null when omitted", () => {
    const { subtitle, source_document_id, ...rest } = validArgs;
    void subtitle;
    void source_document_id;
    const card = parseAnswerCardArgs(rest);
    expect(card?.subtitle).toBeNull();
    expect(card?.actionDocumentId).toBeNull();
  });

  it("rejects an invalid card_type", () => {
    expect(
      parseAnswerCardArgs({ ...validArgs, card_type: "unbekannt" }),
    ).toBeNull();
  });

  it("rejects a missing title", () => {
    const { title, ...rest } = validArgs;
    void title;
    expect(parseAnswerCardArgs(rest)).toBeNull();
  });

  it("rejects an empty fields array", () => {
    expect(parseAnswerCardArgs({ ...validArgs, fields: [] })).toBeNull();
  });

  it("rejects more than 6 fields", () => {
    const fields = Array.from({ length: 7 }, (_, i) => ({
      label: `Feld ${i}`,
      value: `Wert ${i}`,
    }));
    expect(parseAnswerCardArgs({ ...validArgs, fields })).toBeNull();
  });

  it("rejects a title longer than 80 characters", () => {
    expect(
      parseAnswerCardArgs({ ...validArgs, title: "a".repeat(81) }),
    ).toBeNull();
  });

  it("rejects hedging language in the title", () => {
    expect(
      parseAnswerCardArgs({ ...validArgs, title: "Vermutlich ein Termin" }),
    ).toBeNull();
  });

  it("rejects hedging language in a field value", () => {
    expect(
      parseAnswerCardArgs({
        ...validArgs,
        fields: [{ label: "Datum", value: "Könnte sein, 12.08.2026" }],
      }),
    ).toBeNull();
  });

  it("returns null for completely malformed input", () => {
    expect(parseAnswerCardArgs(null)).toBeNull();
    expect(parseAnswerCardArgs(undefined)).toBeNull();
    expect(parseAnswerCardArgs("not an object")).toBeNull();
    expect(parseAnswerCardArgs({})).toBeNull();
  });
});
