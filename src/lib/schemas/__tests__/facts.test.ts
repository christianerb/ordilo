import { describe, it, expect } from "vitest";
import {
  createFactSchema,
  updateFactSchema,
  deleteFactSchema,
  MAX_FACT_VALUE_LENGTH,
  MAX_FACT_LABEL_LENGTH,
} from "@/lib/schemas/facts";

describe("createFactSchema", () => {
  it("accepts a valid fact and trims the value", () => {
    const result = createFactSchema.safeParse({
      fact_type: "iban",
      value: "  DE02120300000000202051  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("DE02120300000000202051");
      expect(result.data.label).toBeUndefined();
    }
  });

  it("accepts an optional label", () => {
    const result = createFactSchema.safeParse({
      fact_type: "contract_number",
      value: "12345",
      label: "Vertragsnummer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fact types", () => {
    expect(
      createFactSchema.safeParse({ fact_type: "nope", value: "x" }).success,
    ).toBe(false);
  });

  it("rejects empty or oversized values", () => {
    expect(
      createFactSchema.safeParse({ fact_type: "iban", value: "   " }).success,
    ).toBe(false);
    expect(
      createFactSchema.safeParse({
        fact_type: "iban",
        value: "x".repeat(MAX_FACT_VALUE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects oversized labels", () => {
    expect(
      createFactSchema.safeParse({
        fact_type: "iban",
        value: "x",
        label: "y".repeat(MAX_FACT_LABEL_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("updateFactSchema", () => {
  it("requires fact_id and value", () => {
    expect(
      updateFactSchema.safeParse({ fact_id: "f1", value: "neu" }).success,
    ).toBe(true);
    expect(updateFactSchema.safeParse({ value: "neu" }).success).toBe(false);
    expect(updateFactSchema.safeParse({ fact_id: "f1" }).success).toBe(false);
  });
});

describe("deleteFactSchema", () => {
  it("requires fact_id", () => {
    expect(deleteFactSchema.safeParse({ fact_id: "f1" }).success).toBe(true);
    expect(deleteFactSchema.safeParse({}).success).toBe(false);
    expect(deleteFactSchema.safeParse({ fact_id: "" }).success).toBe(false);
  });
});
