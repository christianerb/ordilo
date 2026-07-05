import { describe, it, expect } from "vitest";
import {
  searchRequestSchema,
  SEARCH_MODES,
  isTaskQuery,
  findMentionedMembers,
  selectAutoMode,
} from "@/lib/schemas/search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// searchRequestSchema
// ---------------------------------------------------------------------------

describe("searchRequestSchema", () => {
  it("accepts a valid semantic search request", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: VALID_FAMILY_ID,
      mode: "semantic",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Stromrechnung");
      expect(result.data.family_id).toBe(VALID_FAMILY_ID);
      expect(result.data.mode).toBe("semantic");
    }
  });

  it("accepts a valid graph search request", () => {
    const result = searchRequestSchema.safeParse({
      query: "Zeig mir alles von Emma",
      family_id: VALID_FAMILY_ID,
      mode: "graph",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("graph");
    }
  });

  it("accepts a valid auto search request", () => {
    const result = searchRequestSchema.safeParse({
      query: "Was muss ich diese Woche erledigen?",
      family_id: VALID_FAMILY_ID,
      mode: "auto",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("auto");
    }
  });

  // --- Missing fields (VAL-SEARCH-007) ---

  it("rejects missing query", () => {
    const result = searchRequestSchema.safeParse({
      family_id: VALID_FAMILY_ID,
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing family_id", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing mode", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: VALID_FAMILY_ID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query string", () => {
    const result = searchRequestSchema.safeParse({
      query: "",
      family_id: VALID_FAMILY_ID,
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only query string (trims then checks min(1))", () => {
    const result = searchRequestSchema.safeParse({
      query: "   ",
      family_id: VALID_FAMILY_ID,
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty family_id", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: "",
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  // --- Invalid mode (VAL-SEARCH-005) ---

  it("rejects invalid mode value", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: VALID_FAMILY_ID,
      mode: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mode that is not a string", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: VALID_FAMILY_ID,
      mode: 42,
    });
    expect(result.success).toBe(false);
  });

  // --- Invalid family_id format ---

  it("rejects non-UUID family_id", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: "not-a-uuid",
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects family_id with wrong format", () => {
    const result = searchRequestSchema.safeParse({
      query: "Stromrechnung",
      family_id: "550e8400-e29b-41d4-a716",
      mode: "semantic",
    });
    expect(result.success).toBe(false);
  });

  // --- Whitespace trimming ---

  it("trims whitespace from query", () => {
    const result = searchRequestSchema.safeParse({
      query: "  Stromrechnung  ",
      family_id: VALID_FAMILY_ID,
      mode: "semantic",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Stromrechnung");
    }
  });
});

// ---------------------------------------------------------------------------
// SEARCH_MODES constant
// ---------------------------------------------------------------------------

describe("SEARCH_MODES", () => {
  it("contains semantic, graph, and auto", () => {
    expect(SEARCH_MODES).toContain("semantic");
    expect(SEARCH_MODES).toContain("graph");
    expect(SEARCH_MODES).toContain("auto");
    expect(SEARCH_MODES).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// isTaskQuery
// ---------------------------------------------------------------------------

describe("isTaskQuery", () => {
  it("returns true for 'Welche Fristen laufen bald ab?'", () => {
    expect(isTaskQuery("Welche Fristen laufen bald ab?")).toBe(true);
  });

  it("returns true for 'Was muss ich diese Woche erledigen?'", () => {
    expect(isTaskQuery("Was muss ich diese Woche erledigen?")).toBe(true);
  });

  it("returns true for 'Aufgaben'", () => {
    expect(isTaskQuery("Aufgaben")).toBe(true);
  });

  it("returns true for 'deadline'", () => {
    expect(isTaskQuery("Gibt es eine deadline?")).toBe(true);
  });

  it("returns false for 'Stromrechnung'", () => {
    expect(isTaskQuery("Stromrechnung")).toBe(false);
  });

  it("returns false for 'Zeig mir alle Dokumente von Emma'", () => {
    expect(isTaskQuery("Zeig mir alle Dokumente von Emma")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isTaskQuery("FRISTEN")).toBe(true);
    expect(isTaskQuery("Erledigen")).toBe(true);
  });

  // --- Word-boundary matching: prevent over-triggering on substrings ---
  // A query merely containing a task keyword as a substring of a longer
  // word must NOT trigger task mode.

  it("returns false for 'Offenbach Stadtplan' (contains 'offen' as substring)", () => {
    expect(isTaskQuery("Offenbach Stadtplan")).toBe(false);
  });

  it("returns false for 'Ferienwoche Planung' (contains 'woche' as substring)", () => {
    expect(isTaskQuery("Ferienwoche Planung")).toBe(false);
  });

  it("returns false for 'Fristlos kündigen' (contains 'frist' as substring)", () => {
    expect(isTaskQuery("Fristlos kündigen")).toBe(false);
  });

  it("returns false for 'Erinnerungsfoto' (contains 'erinnerung' as substring)", () => {
    expect(isTaskQuery("Erinnerungsfoto")).toBe(false);
  });

  it("returns true for 'Offen' as a standalone word (genuinely task-related)", () => {
    expect(isTaskQuery("Was ist noch offen?")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findMentionedMembers
// ---------------------------------------------------------------------------

describe("findMentionedMembers", () => {
  it("finds a mentioned member name", () => {
    const result = findMentionedMembers("Zeig mir alles von Emma", ["Emma", "Hanna"]);
    expect(result).toEqual(["Emma"]);
  });

  it("finds multiple mentioned members", () => {
    const result = findMentionedMembers("Dokumente von Emma und Hanna", ["Emma", "Hanna", "Lukas"]);
    expect(result).toEqual(["Emma", "Hanna"]);
  });

  it("returns empty when no member is mentioned", () => {
    const result = findMentionedMembers("Stromrechnung", ["Emma", "Hanna"]);
    expect(result).toEqual([]);
  });

  it("is case-insensitive", () => {
    const result = findMentionedMembers("zeig mir alles von emma", ["Emma"]);
    expect(result).toEqual(["Emma"]);
  });

  it("returns empty for empty member list", () => {
    const result = findMentionedMembers("Zeig mir alles von Emma", []);
    expect(result).toEqual([]);
  });

  it("handles empty query", () => {
    const result = findMentionedMembers("", ["Emma"]);
    expect(result).toEqual([]);
  });

  it("ignores empty member names", () => {
    const result = findMentionedMembers("Zeig mir alles", ["", "  "]);
    expect(result).toEqual([]);
  });

  // --- Word-boundary matching: Johanna/Hanna precision ---
  // Querying "Hanna" must NOT match member "Johanna" (and vice versa).

  it("does NOT match 'Hanna' member when query is 'Johanna'", () => {
    const result = findMentionedMembers("Johanna", ["Hanna", "Johanna"]);
    expect(result).toEqual(["Johanna"]);
  });

  it("does NOT match 'Johanna' member when query is 'Hanna'", () => {
    const result = findMentionedMembers("Hanna", ["Hanna", "Johanna"]);
    expect(result).toEqual(["Hanna"]);
  });

  it("does NOT match 'Hanna' member when query mentions 'Johanna' in a sentence", () => {
    const result = findMentionedMembers("Zeig mir alles von Johanna", ["Hanna", "Johanna"]);
    expect(result).toEqual(["Johanna"]);
  });

  it("does NOT match 'Johanna' member when query mentions 'Hanna' in a sentence", () => {
    const result = findMentionedMembers("Zeig mir alles von Hanna", ["Hanna", "Johanna"]);
    expect(result).toEqual(["Hanna"]);
  });

  it("matches a name that is a whole word even when another name contains it as a substring", () => {
    // "Anna" should match "anna" but NOT "johanna"
    const result = findMentionedMembers("Zeig mir Dokumente von Anna", ["Anna", "Johanna"]);
    expect(result).toEqual(["Anna"]);
  });

  it("does not match a member name embedded in a longer word in the query", () => {
    // "Emma" should NOT match when query contains "Emmeline" (a different name)
    const result = findMentionedMembers("Emmeline war hier", ["Emma"]);
    expect(result).toEqual([]);
  });

  it("handles names with umlauts via Unicode-aware word boundaries", () => {
    const result = findMentionedMembers("Zeig mir alles von Jürgen", ["Jürgen", "Jürg"]);
    expect(result).toEqual(["Jürgen"]);
  });
});

// ---------------------------------------------------------------------------
// selectAutoMode
// ---------------------------------------------------------------------------

describe("selectAutoMode", () => {
  it("selects graph when a member name is mentioned", () => {
    expect(selectAutoMode("Zeig mir alle Dokumente von Emma", ["Emma", "Hanna"])).toBe("graph");
  });

  it("selects graph when task keywords are present (no member name)", () => {
    expect(selectAutoMode("Welche Fristen laufen bald ab?", ["Emma"])).toBe("graph");
  });

  it("selects graph for 'Was muss ich diese Woche erledigen?'", () => {
    expect(selectAutoMode("Was muss ich diese Woche erledigen?", ["Emma"])).toBe("graph");
  });

  it("selects semantic for content queries without person or task keywords", () => {
    expect(selectAutoMode("Finde die letzte Stromrechnung", ["Emma"])).toBe("semantic");
  });

  it("selects semantic when no members exist and no task keywords", () => {
    expect(selectAutoMode("Stromrechnung", [])).toBe("semantic");
  });

  it("prioritizes graph when both member and task keywords present", () => {
    expect(selectAutoMode("Was muss ich für Hanna erledigen?", ["Hanna"])).toBe("graph");
  });

  // --- Over-triggering: queries with incidental substrings fall back to semantic ---

  it("selects semantic for 'Offenbach Stadtplan' (incidental 'offen' substring)", () => {
    expect(selectAutoMode("Offenbach Stadtplan", ["Emma"])).toBe("semantic");
  });

  it("selects semantic for 'Ferienwoche Planung' (incidental 'woche' substring)", () => {
    expect(selectAutoMode("Ferienwoche Planung", ["Emma"])).toBe("semantic");
  });

  it("selects semantic for 'Fristlos kündigen' (incidental 'frist' substring)", () => {
    expect(selectAutoMode("Fristlos kündigen", ["Emma"])).toBe("semantic");
  });

  it("selects semantic for 'Erinnerungsfoto' (incidental 'erinnerung' substring)", () => {
    expect(selectAutoMode("Erinnerungsfoto", ["Emma"])).toBe("semantic");
  });

  it("selects semantic for 'Johanna' when only 'Hanna' is a member (no whole-word match)", () => {
    expect(selectAutoMode("Johanna", ["Hanna"])).toBe("semantic");
  });
});
