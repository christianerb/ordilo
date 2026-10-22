import { describe, it, expect } from "vitest";
import {
  editDistance,
  extractGraphKeywords,
  foldForMatch,
  ilikeContainsFilter,
  isTypoOf,
  keywordLabelScore,
  personLabelMatches,
} from "@/lib/ai/graph-match";

describe("foldForMatch", () => {
  it("spells out umlauts and drops other accents", () => {
    expect(foldForMatch("Füße Öl Ärger")).toBe("fuesse oel aerger");
    expect(foldForMatch("Chloé")).toBe("chloe");
  });
});

describe("editDistance", () => {
  it("counts an adjacent swap as one edit", () => {
    expect(editDistance("hnanah", "hannah", 2)).toBe(1);
  });

  it("stops early once the budget is exceeded", () => {
    expect(editDistance("abc", "xyzuvw", 1)).toBe(2);
  });
});

describe("isTypoOf", () => {
  it("accepts typical name typos", () => {
    expect(isTypoOf("hana", "hannah")).toBe(true);
    expect(isTypoOf("hanah", "hannah")).toBe(true);
    expect(isTypoOf("tomas", "thomas")).toBe(true);
    expect(isTypoOf("rentenversicherug", "rentenversicherung")).toBe(true);
  });

  it("rejects different names and words", () => {
    expect(isTypoOf("anna", "hannah")).toBe(false);
    expect(isTypoOf("max", "maximilian")).toBe(false);
    expect(isTypoOf("thema", "thomas")).toBe(false);
    expect(isTypoOf("mia", "mit")).toBe(false);
  });
});

describe("personLabelMatches", () => {
  it("matches the first name as a whole word, typo-tolerant", () => {
    expect(personLabelMatches("Hannah Becker", "Hannah")).toBe(true);
    expect(personLabelMatches("Hannah Becker", "Hanahs")).toBe(true);
  });

  it("never matches a name inside another", () => {
    expect(personLabelMatches("Hannah Becker", "Anna")).toBe(false);
    expect(personLabelMatches("Maximilian Weber", "Max")).toBe(false);
  });
});

describe("keywordLabelScore", () => {
  const org = { compounds: true };

  it("ranks exact over word over compound over typo", () => {
    const exact = keywordLabelScore("Deutsche Bahn", "deutsche bahn", org);
    const word = keywordLabelScore("Deutsche Bahn", "bahn", org);
    const compound = keywordLabelScore("Zahnarztpraxis", "zahnarzt", org);
    const typo = keywordLabelScore("Stadtwerke München", "stadwerke", org);
    expect(exact).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(compound);
    expect(compound).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it("keeps short words out of compounds", () => {
    expect(keywordLabelScore("Gemeinde Oberhaching", "mein", org)).toBe(0);
  });

  it("matches umlauts written either way", () => {
    expect(keywordLabelScore("Stadtwerke München", foldForMatch("münchen"), org)).toBeGreaterThan(0);
    expect(keywordLabelScore("Stadtwerke München", "muenchen", org)).toBeGreaterThan(0);
  });
});

describe("extractGraphKeywords", () => {
  it("drops filler words in either umlaut spelling", () => {
    expect(extractGraphKeywords("Welche Unterlagen gibt es für die Wohnung")).toEqual(["wohnung"]);
    expect(extractGraphKeywords("Was hat mein Sohn fuer Termine")).toEqual(["sohn"]);
  });

  it("adds adjacent pairs for multi-word names", () => {
    expect(extractGraphKeywords("Brief der Kita Sonnenblume")).toContain("kita sonnenblume");
  });
});

describe("ilikeContainsFilter", () => {
  it("quotes values so commas and parentheses cannot split the filter", () => {
    expect(ilikeContainsFilter("label", "Schmidt, Meyer (GbR)")).toBe(
      'label.ilike."%Schmidt, Meyer (GbR)%"',
    );
  });

  it("escapes LIKE wildcards and quotes", () => {
    // %100\%\_"x"% with backslashes and quotes escaped for PostgREST.
    expect(ilikeContainsFilter("label", '100%_"x"')).toBe(
      'label.ilike."%100\\\\%\\\\_\\"x\\"%"',
    );
  });
});
