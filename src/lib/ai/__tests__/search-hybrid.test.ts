import { describe, it, expect } from "vitest";
import { fuseResultsRrf } from "@/lib/ai/search";
import {
  normalizeFactValue,
  documentAnalysisSchema,
  expandIdentifierTerms,
  compoundNumberStems,
  asksForIdentifier,
} from "@/lib/schemas/extraction";
import type { SearchResult } from "@/lib/schemas/search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function result(
  documentId: string,
  score: number,
  source: string,
): SearchResult {
  return {
    document_id: documentId,
    title: `Doc ${documentId}`,
    chunk_text: "…",
    score,
    source,
  };
}

// ---------------------------------------------------------------------------
// normalizeFactValue
// ---------------------------------------------------------------------------

describe("normalizeFactValue", () => {
  it("lowercases and strips separators", () => {
    expect(normalizeFactValue("SN 4823-XK")).toBe("sn4823xk");
  });

  it("normalizes IBAN formatting", () => {
    expect(normalizeFactValue("DE89 3704 0044 0532 0130 00")).toBe(
      "de89370400440532013000",
    );
  });

  it("keeps unicode letters (umlauts)", () => {
    expect(normalizeFactValue("Vertrag-Ö.42")).toBe("vertragö42");
  });

  it("returns empty string for separator-only input", () => {
    expect(normalizeFactValue("--- ///")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// fuseResultsRrf
// ---------------------------------------------------------------------------

describe("fuseResultsRrf", () => {
  it("preserves single-list ordering and scores", () => {
    const list = [result("a", 0.9, "semantic"), result("b", 0.7, "semantic")];
    const fused = fuseResultsRrf([list]);

    expect(fused.map((r) => r.document_id)).toEqual(["a", "b"]);
    expect(fused[0].score).toBe(0.9);
    expect(fused[0].source).toBe("semantic");
  });

  it("ranks documents appearing in multiple lists above single-list hits", () => {
    const semantic = [
      result("only-semantic", 0.95, "semantic"),
      result("both", 0.6, "semantic"),
    ];
    const lexical = [result("both", 0.4, "lexical")];

    const fused = fuseResultsRrf([semantic, lexical]);

    // "both" appears at rank 2 + rank 1 → RRF sum beats a single rank-1 hit.
    expect(fused[0].document_id).toBe("both");
    expect(fused[0].source).toBe("hybrid");
  });

  it("keeps the best original score plus a small multi-source boost", () => {
    const semantic = [result("d", 0.6, "semantic")];
    const lexical = [result("d", 0.4, "lexical")];

    const fused = fuseResultsRrf([semantic, lexical]);

    expect(fused).toHaveLength(1);
    expect(fused[0].score).toBeCloseTo(0.65, 5);
  });

  it("caps the boosted score at 1.0", () => {
    const a = [result("d", 0.99, "semantic")];
    const b = [result("d", 0.9, "lexical")];
    const c = [result("d", 0.98, "fact")];

    const fused = fuseResultsRrf([a, b, c]);
    expect(fused[0].score).toBeLessThanOrEqual(1.0);
  });

  it("returns empty for empty input lists", () => {
    expect(fuseResultsRrf([[], []])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// documentAnalysisSchema — facts field
// ---------------------------------------------------------------------------

describe("documentAnalysisSchema facts", () => {
  const base = {
    document_type: "invoice",
    title: "Stromrechnung",
    summary: "Rechnung der Stadtwerke.",
    family_members: [],
    organizations: [],
    dates: [],
    amounts: [],
    tasks: [],
    suggested_category: "Rechnungen",
    tags: [],
    needs_user_review: false,
  };

  it("defaults facts to [] when missing (older clients)", () => {
    const parsed = documentAnalysisSchema.parse(base);
    expect(parsed.facts).toEqual([]);
  });

  it("accepts a fact as label plus value", () => {
    const parsed = documentAnalysisSchema.parse({
      ...base,
      facts: [
        {
          label: "Seriennummer Waschmaschine",
          value: "SN 4823-XK",
          confidence: 0.92,
        },
      ],
    });
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.facts[0].fact_type).toBe("identifier");
  });

  it("keeps the stored type of rows written before the type collapse", () => {
    // Confirmed documents are reconstructed from document_facts rows, and
    // those still carry their old value until the migration runs.
    const parsed = documentAnalysisSchema.parse({
      ...base,
      facts: [
        {
          fact_type: "serial_number",
          label: "Seriennummer Waschmaschine",
          value: "SN 4823-XK",
          confidence: 0.92,
        },
      ],
    });
    expect(parsed.facts[0].fact_type).toBe("serial_number");
  });

  it("rejects a fact without a label", () => {
    const parsed = documentAnalysisSchema.safeParse({
      ...base,
      facts: [{ label: "", value: "030 1234567", confidence: 0.9 }],
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// expandIdentifierTerms — the words families actually use
// ---------------------------------------------------------------------------

describe("expandIdentifierTerms", () => {
  it("expands a colloquial 'Steuernummer' question to the Steuer-ID spellings", () => {
    const terms = expandIdentifierTerms("Wie ist die Steuernummer von Hanna?");
    expect(terms).toContain("steuer-id");
    expect(terms).toContain("steuerid");
    expect(terms).toContain("idnr");
  });

  it("works from every spelling in the group", () => {
    for (const query of [
      "Wo ist Hannas Steuer-ID?",
      "Zeig mir die steuerliche Identifikationsnummer",
      "Wie lautet die IdNr von Hanna?",
    ]) {
      expect(expandIdentifierTerms(query)).toContain("steuernummer");
    }
  });

  it("expands synonyms of the other number kinds", () => {
    expect(expandIdentifierTerms("Wie ist die Versicherungsnummer?")).toContain(
      "policennummer",
    );
    expect(expandIdentifierTerms("Was ist unsere Kontonummer?")).toContain(
      "iban",
    );
    expect(expandIdentifierTerms("Wie ist das Nummernschild?")).toContain(
      "kennzeichen",
    );
  });

  it("returns nothing for a question about no particular number", () => {
    expect(expandIdentifierTerms("Was steht in dem Kita-Brief?")).toEqual([]);
    // A number kind nobody listed is found by its own label, not by
    // expansion — the groups are a recall aid, not a taxonomy.
    expect(expandIdentifierTerms("Wie ist die Bestellnummer?")).toEqual([]);
  });

  it("does not match keywords inside longer words", () => {
    // "tin" must not fire on "Termin", "police" not on "Polizei".
    expect(expandIdentifierTerms("Wann ist der Termin?")).toEqual([]);
    expect(expandIdentifierTerms("Brief von der Polizei")).toEqual([]);
  });
});

describe("compoundNumberStems", () => {
  it("reduces a compound number word to the thing it belongs to", () => {
    expect(compoundNumberStems("Wie ist die Aktenzeichennummer?")).toEqual([
      "aktenzeichen",
    ]);
    expect(compoundNumberStems("Wie ist die Zählernummer im Keller?")).toEqual([
      "zähler",
    ]);
    expect(compoundNumberStems("Wie ist die Steuernummer?")).toEqual(["steuer"]);
  });

  it("leaves a bare 'Nummer' alone — it would match everything", () => {
    expect(compoundNumberStems("Wie ist die Nummer?")).toEqual([]);
    expect(compoundNumberStems("Nr. 12")).toEqual([]);
  });

  it("ignores stems too short to search labels with", () => {
    expect(compoundNumberStems("Wie ist die Kfz-Nr?")).toEqual([]);
  });

  it("carries compounds into their synonym group", () => {
    // "Aktenzeichen" alone is in a group; the compound has to reach it.
    expect(expandIdentifierTerms("Wie ist die Aktenzeichennummer?")).toContain(
      "geschäftszeichen",
    );
  });
});

describe("asksForIdentifier", () => {
  it("recognises a question about a stored number", () => {
    expect(asksForIdentifier("Wie ist die Steuernummer von Hanna?")).toBe(true);
    expect(asksForIdentifier("Wie ist die Aktenzeichennummer?")).toBe(true);
    expect(asksForIdentifier("Was steht in dem Kita-Brief?")).toBe(false);
  });
});
