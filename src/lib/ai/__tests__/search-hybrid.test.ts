import { describe, it, expect } from "vitest";
import { fuseResultsRrf } from "@/lib/ai/search";
import {
  normalizeFactValue,
  documentAnalysisSchema,
  factTypesForQuery,
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

  it("accepts valid facts", () => {
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
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.facts[0].fact_type).toBe("serial_number");
  });

  it("rejects unknown fact types", () => {
    const parsed = documentAnalysisSchema.safeParse({
      ...base,
      facts: [
        {
          fact_type: "phone_number",
          label: "Telefon",
          value: "030 1234567",
          confidence: 0.9,
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// factTypesForQuery — the words families actually use
// ---------------------------------------------------------------------------

describe("factTypesForQuery", () => {
  it("finds both tax types for a colloquial 'Steuernummer' question", () => {
    const types = factTypesForQuery("Wie ist die Steuernummer von Hanna?");
    expect(types).toContain("tax_id");
    expect(types).toContain("tax_number");
  });

  it("matches the Steuer-ID spellings families use", () => {
    for (const query of [
      "Wo ist Hannas Steuer-ID?",
      "Zeig mir die steuerliche Identifikationsnummer",
      "Wie lautet die IdNr von Hanna?",
    ]) {
      expect(factTypesForQuery(query)).toContain("tax_id");
    }
  });

  it("maps synonyms to their type", () => {
    expect(factTypesForQuery("Wie ist die Versicherungsnummer?")).toContain(
      "policy_number",
    );
    expect(factTypesForQuery("Was ist unsere Kontonummer?")).toContain("iban");
    expect(factTypesForQuery("Wie ist das Nummernschild?")).toContain(
      "license_plate",
    );
    expect(
      factTypesForQuery("Wie ist die Versichertennummer von Hanna?"),
    ).toContain("health_insurance_number");
  });

  it("returns nothing for a question about no particular number", () => {
    expect(factTypesForQuery("Was steht in dem Kita-Brief?")).toEqual([]);
  });

  it("does not match keywords inside longer words", () => {
    // "tin" must not fire on "Termin", "police" not on "Polizei".
    expect(factTypesForQuery("Wann ist der Termin?")).toEqual([]);
    expect(factTypesForQuery("Brief von der Polizei")).toEqual([]);
  });

  it("keeps a bare 'Nummer' question out of the untyped bucket", () => {
    // FACT_TYPE_KEYWORDS.other is deliberately narrow — otherwise every
    // question containing "Nummer" would drag in every untyped fact.
    expect(factTypesForQuery("Wie ist die Nummer?")).toEqual([]);
    expect(factTypesForQuery("Wie ist die Kennnummer?")).toEqual(["other"]);
  });
});
