import { describe, it, expect, vi } from "vitest";

import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";

interface FamilyFields {
  id: string;
  name: string;
  onboarding_completed_at?: string | null;
}

/**
 * Build a mock Supabase client for resolveUserFamily's two-query pattern:
 *   1. families.select().eq("created_by", uid).order().limit(1).maybeSingle()
 *   2. family_memberships.select("families(...)").eq("user_id", uid)
 *       .order().limit(1).maybeSingle()   (only when query 1 finds nothing)
 */
function mockSupabase({
  user = { id: "user-1" } as { id: string } | null,
  owned = null as FamilyFields | null,
  ownedError = null as unknown,
  membership = null as { family_id: string; families: FamilyFields } | null,
  membershipError = null as unknown,
} = {}) {
  const ownedChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: owned, error: ownedError }),
  };
  const membershipChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: membership, error: membershipError }),
  };

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "families") return { select: vi.fn(() => ownedChain) };
      if (table === "family_memberships") {
        return { select: vi.fn(() => membershipChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    client: client as unknown as Parameters<typeof resolveUserFamily>[0],
    ownedChain,
    membershipChain,
    fromSpy: client.from,
    getUserSpy: client.auth.getUser,
  };
}

const ownedFamily: FamilyFields = {
  id: "fam-owned",
  name: "Eigene Familie",
  onboarding_completed_at: "2026-01-01T00:00:00Z",
};

const invitedFamily: FamilyFields = {
  id: "fam-invited",
  name: "Partnerfamilie",
  onboarding_completed_at: "2025-06-01T00:00:00Z",
};

describe("resolveUserFamily", () => {
  it("returns null when there is no session", async () => {
    const { client } = mockSupabase({ user: null });
    const result = await resolveUserFamily(client);
    expect(result).toEqual({ data: null, error: null });
  });

  it("returns null when the user has no family at all", async () => {
    const { client } = mockSupabase();
    const result = await resolveUserFamily(client);
    expect(result).toEqual({ data: null, error: null });
  });

  it("returns the owned family", async () => {
    const { client } = mockSupabase({ owned: ownedFamily });
    const result = await resolveUserFamily(client);
    expect(result).toEqual({ data: { ...ownedFamily, isOwner: true }, error: null });
  });

  it("prefers the owned family and never queries memberships", async () => {
    // Even when a membership exists, the owned family must win — this
    // preserves the pre-memberships behavior for family creators, and the
    // fallback query should not fire at all.
    const { client, fromSpy } = mockSupabase({
      owned: ownedFamily,
      membership: { family_id: invitedFamily.id, families: invitedFamily },
    });
    const result = await resolveUserFamily(client);
    expect(result.data).toEqual({ ...ownedFamily, isOwner: true });
    expect(fromSpy).not.toHaveBeenCalledWith("family_memberships");
  });

  it("falls back to the oldest membership for invite-only accounts", async () => {
    const { client } = mockSupabase({
      membership: { family_id: invitedFamily.id, families: invitedFamily },
    });
    const result = await resolveUserFamily(client);
    expect(result.data).toEqual({ ...invitedFamily, isOwner: false });
  });

  it("orders the fallback by membership creation, not family creation", async () => {
    // P2 regression: the documented "oldest membership" rule must order
    // family_memberships.created_at (when the user JOINED). Ordering
    // families.created_at would pick the longest-existing family even if
    // the user joined it yesterday. The ordering happens database-side —
    // pin the query shape so a regression back to the families table (or
    // a missing user filter against co-members' rows) fails loudly.
    const { client, membershipChain } = mockSupabase({
      membership: { family_id: invitedFamily.id, families: invitedFamily },
    });
    await resolveUserFamily(client);
    expect(membershipChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(membershipChain.order).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
  });

  it("filters the owned lookup by created_by", async () => {
    const { client, ownedChain } = mockSupabase({ owned: ownedFamily });
    await resolveUserFamily(client);
    expect(ownedChain.eq).toHaveBeenCalledWith("created_by", "user-1");
  });

  it("skips the auth round-trip when the caller passes the user id", async () => {
    const { client, getUserSpy, ownedChain } = mockSupabase({
      owned: ownedFamily,
    });
    const result = await resolveUserFamily(client, "user-1");
    expect(result.data).toEqual({ ...ownedFamily, isOwner: true });
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(ownedChain.eq).toHaveBeenCalledWith("created_by", "user-1");
  });

  it("returns a friendly error when the owned lookup fails", async () => {
    const { client } = mockSupabase({
      ownedError: { message: "db down" },
    });
    const result = await resolveUserFamily(client);
    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    );
  });

  it("returns a friendly error when the membership lookup fails", async () => {
    const { client } = mockSupabase({
      membershipError: { message: "db down" },
    });
    const result = await resolveUserFamily(client);
    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    );
  });
});
