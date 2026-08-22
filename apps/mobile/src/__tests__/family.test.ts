import {
  canCreateFamilyInvite,
  isOnboardingComplete,
  needsWelcomeIntro,
  resolveUserFamily,
  type ResolvedFamily,
} from "../lib/family";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mirrors the web resolution rule (src/lib/supabase/resolve-user-family.ts):
 * owned family first, else the oldest membership. The gate logic depends on
 * this staying identical across platforms.
 */

interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
}

function makeQuery(result: QueryResult) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    query[method] = jest.fn(() => query);
  }
  query.maybeSingle = jest.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  return query;
}

function makeSupabase(tables: Record<string, QueryResult>, userId = "u1") {
  return {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
      })),
    },
    from: jest.fn((table: string) => makeQuery(tables[table] ?? {})),
  } as unknown as SupabaseClient;
}

const ownedFamily = {
  id: "fam-1",
  name: "Familie Müller",
  onboarding_completed_at: "2026-08-01T10:00:00Z",
};

describe("resolveUserFamily", () => {
  it("prefers the owned family over memberships", async () => {
    const supabase = makeSupabase({ families: { data: ownedFamily } });

    const result = await resolveUserFamily(supabase, "u1");

    expect(result).toEqual({
      data: { ...ownedFamily, isOwner: true, introSeenAt: null },
      error: null,
    });
  });

  it("falls back to the oldest membership for invite-only accounts", async () => {
    const supabase = makeSupabase({
      families: { data: null },
      family_memberships: {
        data: {
          intro_seen_at: "2026-08-10T08:00:00Z",
          families: {
            id: "fam-2",
            name: "Familie Schmidt",
            onboarding_completed_at: null,
          },
        },
      },
    });

    const result = await resolveUserFamily(supabase, "u1");

    expect(result).toEqual({
      data: {
        id: "fam-2",
        name: "Familie Schmidt",
        onboarding_completed_at: null,
        isOwner: false,
        introSeenAt: "2026-08-10T08:00:00Z",
      },
      error: null,
    });
  });

  it("guards against the array shape of the many-to-one embed", async () => {
    const supabase = makeSupabase({
      families: { data: null },
      family_memberships: {
        data: {
          intro_seen_at: null,
          families: [
            {
              id: "fam-3",
              name: "Familie Test",
              onboarding_completed_at: "2026-01-01T00:00:00Z",
            },
          ],
        },
      },
    });

    const result = await resolveUserFamily(supabase, "u1");

    expect(result.data?.id).toBe("fam-3");
    expect(result.data?.isOwner).toBe(false);
  });

  it("returns null data when the user has no family at all", async () => {
    const supabase = makeSupabase({
      families: { data: null },
      family_memberships: { data: null },
    });

    const result = await resolveUserFamily(supabase, "u1");

    expect(result).toEqual({ data: null, error: null });
  });

  it("returns null data without a session user", async () => {
    const supabase = makeSupabase({}, "");

    const result = await resolveUserFamily(supabase);

    expect(result).toEqual({ data: null, error: null });
  });

  it("surfaces a friendly German error on query failures", async () => {
    const supabase = makeSupabase({
      families: { data: null, error: { message: "boom" } },
    });

    const result = await resolveUserFamily(supabase, "u1");

    expect(result).toEqual({
      data: null,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
  });
});

describe("isOnboardingComplete", () => {
  const base: ResolvedFamily = {
    id: "f",
    name: "F",
    onboarding_completed_at: null,
    isOwner: true,
    introSeenAt: null,
  };

  it("is false without a family", () => {
    expect(isOnboardingComplete(null)).toBe(false);
  });

  it("judges owners by their completion marker", () => {
    expect(isOnboardingComplete(base)).toBe(false);
    expect(
      isOnboardingComplete({ ...base, onboarding_completed_at: "2026-01-01" }),
    ).toBe(true);
  });

  it("never gates invited members on the creator's marker", () => {
    expect(isOnboardingComplete({ ...base, isOwner: false })).toBe(true);
  });
});

describe("needsWelcomeIntro", () => {
  const base: ResolvedFamily = {
    id: "f",
    name: "F",
    onboarding_completed_at: "2026-01-01",
    isOwner: false,
    introSeenAt: null,
  };

  it("is true for invited members who have not seen the intro", () => {
    expect(needsWelcomeIntro(base)).toBe(true);
  });

  it("is false once the intro was acknowledged", () => {
    expect(
      needsWelcomeIntro({ ...base, introSeenAt: "2026-08-10T08:00:00Z" }),
    ).toBe(false);
  });

  it("is never true for owners", () => {
    expect(needsWelcomeIntro({ ...base, isOwner: true })).toBe(false);
    expect(needsWelcomeIntro(null)).toBe(false);
  });
});

describe("canCreateFamilyInvite", () => {
  it("allows invitation creation only for the family owner", () => {
    expect(canCreateFamilyInvite({ isOwner: true })).toBe(true);
    expect(canCreateFamilyInvite({ isOwner: false })).toBe(false);
    expect(canCreateFamilyInvite(null)).toBe(false);
  });
});
