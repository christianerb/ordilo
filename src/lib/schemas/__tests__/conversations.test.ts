import { describe, it, expect } from "vitest";
import { updateConversationSchema } from "@/lib/schemas/conversations";

describe("updateConversationSchema", () => {
  it("accepts a non-empty title and trims it", () => {
    const result = updateConversationSchema.safeParse({ title: "  Neu  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Neu");
  });

  it("rejects missing, empty, or whitespace-only titles", () => {
    expect(updateConversationSchema.safeParse({}).success).toBe(false);
    expect(updateConversationSchema.safeParse({ title: "" }).success).toBe(
      false,
    );
    expect(updateConversationSchema.safeParse({ title: "   " }).success).toBe(
      false,
    );
    expect(updateConversationSchema.safeParse({ title: 42 }).success).toBe(
      false,
    );
  });
});
