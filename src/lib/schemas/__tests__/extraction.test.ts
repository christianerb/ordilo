import { describe, it, expect } from "vitest";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  TASK_PRIORITIES,
  LOW_CONFIDENCE_THRESHOLD,
  documentAnalysisSchema,
  documentAnalysisJsonSchema,
  computeNeedsUserReview,
  type DocumentAnalysis,
} from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a valid DocumentAnalysis object for testing. */
function validAnalysis(overrides: Partial<DocumentAnalysis> = {}): DocumentAnalysis {
  return {
    document_type: "letter",
    title: "Einladung zum Elternabend",
    summary: "Elternabend in der Kita Sonnenblume am 15. Juli 2026.",
    family_members: [
      { person_id: "member-1", name: "Emma", confidence: 0.95 },
    ],
    organizations: [
      { name: "Kita Sonnenblume", type: "Kita", confidence: 0.9 },
    ],
    dates: [
      { date: "2026-07-15", type: "event", label: "Elternabend", confidence: 0.88 },
    ],
    amounts: [],
    tasks: [
      { title: "Elternabend besuchen", due_date: "2026-07-15", priority: "medium", confidence: 0.8 },
    ],
    facts: [],
    suggested_category: "Kita",
    tags: ["Elternabend", "Kita"],
    needs_user_review: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DOCUMENT_TYPES
// ---------------------------------------------------------------------------

describe("DOCUMENT_TYPES", () => {
  it("includes all 8 document types from the PRD", () => {
    expect(DOCUMENT_TYPES).toEqual([
      "invoice",
      "letter",
      "contract",
      "medical",
      "school",
      "insurance",
      "tax",
      "other",
    ]);
  });

  it("has German labels for every type", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[type]).toBeDefined();
      expect(typeof DOCUMENT_TYPE_LABELS[type]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// TASK_PRIORITIES
// ---------------------------------------------------------------------------

describe("TASK_PRIORITIES", () => {
  it("includes low, medium, high", () => {
    expect(TASK_PRIORITIES).toEqual(["low", "medium", "high"]);
  });
});

// ---------------------------------------------------------------------------
// LOW_CONFIDENCE_THRESHOLD
// ---------------------------------------------------------------------------

describe("LOW_CONFIDENCE_THRESHOLD", () => {
  it("is 0.7", () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// documentAnalysisSchema
// ---------------------------------------------------------------------------

describe("documentAnalysisSchema", () => {
  it("accepts a valid analysis object", () => {
    const analysis = validAnalysis();
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-enum document_type", () => {
    const analysis = validAnalysis({ document_type: "blog" as never });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(false);
  });

  it("accepts null person_id", () => {
    const analysis = validAnalysis({
      family_members: [{ person_id: null, name: "Unbekannt", confidence: 0.5 }],
    });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(true);
  });

  it("accepts null due_date on tasks", () => {
    const analysis = validAnalysis({
      tasks: [{ title: "Formular ausfüllen", due_date: null, priority: "low", confidence: 0.7 }],
    });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(true);
  });

  it("rejects confidence above 1.0", () => {
    const analysis = validAnalysis({
      family_members: [{ person_id: "m1", name: "Emma", confidence: 1.5 }],
    });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const analysis = validAnalysis({
      organizations: [{ name: "Kita", type: "Kita", confidence: -0.1 }],
    });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-enum task priority", () => {
    const analysis = validAnalysis({
      tasks: [{ title: "Task", due_date: null, priority: "urgent" as never, confidence: 0.8 }],
    });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(false);
  });

  it("rejects missing required field (title)", () => {
    const analysis = validAnalysis();
    delete (analysis as Partial<DocumentAnalysis>).title;
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for all array fields", () => {
    const analysis = validAnalysis({
      family_members: [],
      organizations: [],
      dates: [],
      amounts: [],
      tasks: [],
      tags: [],
    });
    const result = documentAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(true);
  });

  it("rejects an extra top-level field (strict mode, VAL-EXTRACT-002)", () => {
    const analysis = validAnalysis();
    const withExtra = { ...analysis, extra_field: "should fail" };
    const result = documentAnalysisSchema.safeParse(withExtra);
    // Strict mode: extra top-level fields must cause validation to fail,
    // matching the OpenAI strict json_schema request (additionalProperties: false).
    expect(result.success).toBe(false);
  });

  it("rejects a different extra top-level key (VAL-EXTRACT-002)", () => {
    const analysis = validAnalysis();
    const withExtra = { ...analysis, unexpected_key: 42 };
    const result = documentAnalysisSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// documentAnalysisJsonSchema
// ---------------------------------------------------------------------------

describe("documentAnalysisJsonSchema", () => {
  it("has type: object", () => {
    expect(documentAnalysisJsonSchema.type).toBe("object");
  });

  it("has additionalProperties: false", () => {
    expect(documentAnalysisJsonSchema.additionalProperties).toBe(false);
  });

  it("lists all required fields", () => {
    const required = documentAnalysisJsonSchema.required;
    expect(required).toContain("document_type");
    expect(required).toContain("title");
    expect(required).toContain("summary");
    expect(required).toContain("family_members");
    expect(required).toContain("organizations");
    expect(required).toContain("dates");
    expect(required).toContain("amounts");
    expect(required).toContain("tasks");
    expect(required).toContain("suggested_category");
    expect(required).toContain("tags");
    expect(required).toContain("needs_user_review");
  });

  it("constrains document_type to the enum", () => {
    const dt = documentAnalysisJsonSchema.properties.document_type;
    expect(dt.enum).toEqual([...DOCUMENT_TYPES]);
  });

  it("uses nullable type for person_id", () => {
    const fm = documentAnalysisJsonSchema.properties.family_members.items.properties;
    expect(fm.person_id.type).toEqual(["string", "null"]);
  });

  it("uses nullable type for due_date", () => {
    const task = documentAnalysisJsonSchema.properties.tasks.items.properties;
    expect(task.due_date.type).toEqual(["string", "null"]);
  });

  it("constrains task priority to the enum", () => {
    const task = documentAnalysisJsonSchema.properties.tasks.items.properties;
    expect(task.priority.enum).toEqual([...TASK_PRIORITIES]);
  });

  it("has additionalProperties: false on nested objects", () => {
    const fm = documentAnalysisJsonSchema.properties.family_members.items;
    expect(fm.additionalProperties).toBe(false);
    const org = documentAnalysisJsonSchema.properties.organizations.items;
    expect(org.additionalProperties).toBe(false);
    const task = documentAnalysisJsonSchema.properties.tasks.items;
    expect(task.additionalProperties).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeNeedsUserReview
// ---------------------------------------------------------------------------

describe("computeNeedsUserReview", () => {
  it("returns false when all confidences are above threshold", () => {
    const analysis = validAnalysis({
      family_members: [{ person_id: "m1", name: "Emma", confidence: 0.95 }],
      organizations: [{ name: "Kita", type: "Kita", confidence: 0.9 }],
      tasks: [{ title: "Task", due_date: null, priority: "low", confidence: 0.85 }],
    });
    expect(computeNeedsUserReview(analysis)).toBe(false);
  });

  it("returns true when a family member has low confidence", () => {
    const analysis = validAnalysis({
      family_members: [{ person_id: null, name: "Unbekannt", confidence: 0.5 }],
    });
    expect(computeNeedsUserReview(analysis)).toBe(true);
  });

  it("returns true when an organization has low confidence", () => {
    const analysis = validAnalysis({
      organizations: [{ name: "Unbekannte Org", type: "unknown", confidence: 0.4 }],
    });
    expect(computeNeedsUserReview(analysis)).toBe(true);
  });

  it("returns true when a date has low confidence", () => {
    const analysis = validAnalysis({
      dates: [{ date: "2026-07-15", type: "event", label: "Unklar", confidence: 0.3 }],
    });
    expect(computeNeedsUserReview(analysis)).toBe(true);
  });

  it("returns true when an amount has low confidence", () => {
    const analysis = validAnalysis({
      amounts: [{ amount: "50", currency: "EUR", label: "Unklar", confidence: 0.2 }],
    });
    expect(computeNeedsUserReview(analysis)).toBe(true);
  });

  it("returns true when a task has low confidence", () => {
    const analysis = validAnalysis({
      tasks: [{ title: "Unklare Aufgabe", due_date: null, priority: "low", confidence: 0.1 }],
    });
    expect(computeNeedsUserReview(analysis)).toBe(true);
  });

  it("returns false for empty arrays (no entities to check)", () => {
    const analysis = validAnalysis({
      family_members: [],
      organizations: [],
      dates: [],
      amounts: [],
      tasks: [],
    });
    expect(computeNeedsUserReview(analysis)).toBe(false);
  });

  it("returns false at exactly the threshold (0.7 is not below)", () => {
    const analysis = validAnalysis({
      family_members: [{ person_id: "m1", name: "Emma", confidence: 0.7 }],
      organizations: [],
      dates: [],
      amounts: [],
      tasks: [],
    });
    expect(computeNeedsUserReview(analysis)).toBe(false);
  });

  it("returns true just below the threshold (0.69)", () => {
    const analysis = validAnalysis({
      family_members: [{ person_id: "m1", name: "Emma", confidence: 0.69 }],
      organizations: [],
      dates: [],
      amounts: [],
      tasks: [],
    });
    expect(computeNeedsUserReview(analysis)).toBe(true);
  });
});
