import { describe, it, expect, vi } from "vitest";

import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";

/**
 * Build a mock Supabase client for resolveUserFamily: an auth user plus a
 * `families` table whose select/order chain resolves the given rows.
 */
function mockSupabase({
  user = { id: "user-1" } as { id: string } | null,
  families = [] as Array<{
    id: string;
    name: string;
    created_by: string;
    created_at: string;
  }>,
  error = null as unknown,
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table !== "families") throw new Error(`Unexpected table: ${table}`);
      return {
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: families, error }),
        })),
      };
    }),
  } as unknown as Parameters<typeof resolveUserFamily>[0];
}

const owned = {
  id: "fam-owned",
  name: "Eigene Familie",
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
};

const invited = {
  id: "fam-invited",
  name: "Partnerfamilie",
  created_by: "someone-else",
  created_at: "2025-01-01T00:00:00Z",
};

describe("resolveUserFamily", () => {
  it("returns null when there is no session", async () => {
    const result = await resolveUserFamily(mockSupabase({ user: null }));
    expect(result).toEqual({ data: null, error: null });
  });

  it("returns null when the user has no family", async () => {
    const result = await resolveUserFamily(mockSupabase({ families: [] }));
    expect(result).toEqual({ data: null, error: null });
  });

  it("returns the only family", async () => {
    const result = await resolveUserFamily(
      mockSupabase({ families: [owned] }),
    );
    expect(result).toEqual({
      data: { id: "fam-owned", name: "Eigene Familie" },
      error: null,
    });
  });

  it("prefers the owned family even when a membership is older", async () => {
    // Rows arrive ordered by created_at ascending (oldest first): the
    // invited family is older, but the owned one must win — this preserves
    // the pre-memberships behavior for family creators.
    const result = await resolveUserFamily(
      mockSupabase({ families: [invited, owned] }),
    );
    expect(result.data).toEqual({ id: "fam-owned", name: "Eigene Familie" });
  });

  it("falls back to the oldest membership when the user owns no family", async () => {
    const result = await resolveUserFamily(
      mockSupabase({ families: [invited] }),
    );
    expect(result.data).toEqual({ id: "fam-invited", name: "Partnerfamilie" });
  });

  it("returns a friendly error on query failure", async () => {
    const result = await resolveUserFamily(
      mockSupabase({ error: { message: "db down" } }),
    );
    expect(result.data).toBeNull();
    expect(result.error).toBe("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
  });
});
