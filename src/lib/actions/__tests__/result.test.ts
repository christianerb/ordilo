import { describe, it, expect } from "vitest";
import { FRIENDLY_ERROR, getUserFamily } from "@/lib/actions/result";

type SupabaseLike = Parameters<typeof getUserFamily>[0];

function mockSupabase(result: {
  data: { id: string; name: string } | null;
  error: unknown;
}): SupabaseLike {
  return {
    from: () => ({
      select: () => ({
        limit: () => ({ maybeSingle: () => Promise.resolve(result) }),
      }),
    }),
  } as unknown as SupabaseLike;
}

describe("FRIENDLY_ERROR", () => {
  it("is the shared German fallback message", () => {
    expect(FRIENDLY_ERROR).toBe(
      "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    );
  });
});

describe("getUserFamily", () => {
  it("returns the family row on success", async () => {
    const supabase = mockSupabase({
      data: { id: "fam-1", name: "Familie Test" },
      error: null,
    });
    const result = await getUserFamily(supabase);
    expect(result).toEqual({
      data: { id: "fam-1", name: "Familie Test" },
      error: null,
    });
  });

  it("returns null data when the user has no family", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    const result = await getUserFamily(supabase);
    expect(result).toEqual({ data: null, error: null });
  });

  it("returns FRIENDLY_ERROR when the query fails", async () => {
    const supabase = mockSupabase({
      data: null,
      error: new Error("db down"),
    });
    const result = await getUserFamily(supabase);
    expect(result).toEqual({ data: null, error: FRIENDLY_ERROR });
  });
});
