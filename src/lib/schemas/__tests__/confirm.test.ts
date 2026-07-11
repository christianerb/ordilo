import { describe, it, expect } from "vitest";
import {
  confirmPayloadSchema,
  CONFIRM_ALLOWED_SOURCE_STATUSES,
} from "@/lib/schemas/confirm";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a valid DocumentAnalysis for testing. */
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

/** Create a valid confirm payload (DocumentAnalysis + deletedTaskIndices). */
function validPayload(overrides: Partial<DocumentAnalysis> & { deletedTaskIndices?: number[] } = {}) {
  const { deletedTaskIndices, ...analysisOverrides } = overrides;
  return {
    ...validAnalysis(analysisOverrides),
    deletedTaskIndices: deletedTaskIndices ?? [],
  };
}

// ---------------------------------------------------------------------------
// confirmPayloadSchema
// ---------------------------------------------------------------------------

describe("confirmPayloadSchema", () => {
  it("validates a valid payload", () => {
    const payload = validPayload();
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("validates a payload with deletedTaskIndices", () => {
    const payload = validPayload({ deletedTaskIndices: [2, 5] });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedTaskIndices).toEqual([2, 5]);
    }
  });

  it("defaults deletedTaskIndices to empty array when omitted", () => {
    const analysis = validAnalysis();
    const result = confirmPayloadSchema.safeParse(analysis);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedTaskIndices).toEqual([]);
    }
  });

  it("rejects missing document_type", () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).document_type;
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects invalid document_type (not in enum)", () => {
    const payload = validPayload({ document_type: "blog" as DocumentAnalysis["document_type"] });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).title;
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects missing family_members array", () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).family_members;
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects family_member with missing confidence", () => {
    const payload = validPayload({
      family_members: [
        { person_id: "m1", name: "Emma" } as DocumentAnalysis["family_members"][0],
      ],
    });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects task with invalid priority", () => {
    const payload = validPayload({
      tasks: [
        { title: "Test", due_date: null, priority: "urgent" as DocumentAnalysis["tasks"][0]["priority"], confidence: 0.9 },
      ],
    });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("validates payload with empty arrays", () => {
    const payload = validPayload({
      family_members: [],
      organizations: [],
      dates: [],
      amounts: [],
      tasks: [],
      tags: [],
    });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("validates payload with null person_id", () => {
    const payload = validPayload({
      family_members: [
        { person_id: null, name: "Unknown Person", confidence: 0.5 },
      ],
    });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("validates payload with null task due_date", () => {
    const payload = validPayload({
      tasks: [
        { title: "No deadline task", due_date: null, priority: "low", confidence: 0.8 },
      ],
    });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("validates payload with all document types", () => {
    const types = ["invoice", "letter", "contract", "medical", "school", "insurance", "tax", "other"];
    for (const type of types) {
      const payload = validPayload({ document_type: type as DocumentAnalysis["document_type"] });
      const result = confirmPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    }
  });

  it("rejects deletedTaskIndices with negative numbers", () => {
    const payload = validPayload({ deletedTaskIndices: [-1] });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects deletedTaskIndices with non-integer numbers", () => {
    const payload = validPayload({ deletedTaskIndices: [1.5] });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("accepts deletedTaskIndices as empty array", () => {
    const payload = validPayload({ deletedTaskIndices: [] });
    const result = confirmPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONFIRM_ALLOWED_SOURCE_STATUSES
// ---------------------------------------------------------------------------

describe("CONFIRM_ALLOWED_SOURCE_STATUSES", () => {
  it("contains only 'analyzed'", () => {
    expect(CONFIRM_ALLOWED_SOURCE_STATUSES.size).toBe(1);
    expect(CONFIRM_ALLOWED_SOURCE_STATUSES.has("analyzed")).toBe(true);
  });

  it("does not contain 'confirmed'", () => {
    expect(CONFIRM_ALLOWED_SOURCE_STATUSES.has("confirmed")).toBe(false);
  });

  it("does not contain 'uploaded'", () => {
    expect(CONFIRM_ALLOWED_SOURCE_STATUSES.has("uploaded")).toBe(false);
  });

  it("does not contain 'failed'", () => {
    expect(CONFIRM_ALLOWED_SOURCE_STATUSES.has("failed")).toBe(false);
  });
});
