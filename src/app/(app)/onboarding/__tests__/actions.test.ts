import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server supabase client before importing actions.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createFamily, addMember, completeOnboarding } from "@/app/(app)/onboarding/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Build a mock Supabase client with a configurable auth user and a set of
 * table chain mocks. Each table mock supports the select/insert/limit/
 * maybeSingle/single chain used by the actions.
 *
 * `selectResults` allows sequencing multiple select.maybeSingle() results
 * (e.g. first call returns null for the pre-check, second call returns the
 * existing family after a constraint-violation re-read).
 */
function mockSupabase(options: {
  user?: { id: string; email: string } | null;
  families?: {
    existing?: { id: string; name: string; onboarding_completed_at?: string | null } | null;
    insertError?: unknown;
    inserted?: { id: string; name: string };
    selectResults?: Array<{ data: { id: string; name: string; onboarding_completed_at?: string | null } | null; error: unknown | null }>;
    updateError?: unknown;
    updated?: { id: string; name: string; onboarding_completed_at: string };
  };
  members?: {
    insertError?: unknown;
    inserted?: Record<string, unknown>;
  };
}) {
  const { user = { id: "user-1", email: "test@ordilo.test" } } = options;

  // families select chain — supports sequential results for the
  // pre-check and the constraint-violation re-read.
  let selectCallIndex = 0;
  const selectResults = options.families?.selectResults;
  const familiesSelectChain = {
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => {
      if (selectResults) {
        const result = selectResults[selectCallIndex] ?? {
          data: null,
          error: null,
        };
        selectCallIndex++;
        return Promise.resolve(result);
      }
      return Promise.resolve({
        data: options.families?.existing ?? null,
        error: null,
      });
    }),
  };
  const familiesInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.families?.inserted ?? null,
      error: options.families?.insertError ?? null,
    }),
  };

  // families update chain — for completeOnboarding which updates
  // onboarding_completed_at on the user's family. The .eq() method
  // returns a Promise (like the real Supabase client) so the action
  // can await the result.
  const familiesUpdateChain = {
    eq: vi.fn().mockResolvedValue({
      data: options.families?.updated ?? null,
      error: options.families?.updateError ?? null,
    }),
  };

  // members chain
  const membersInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.members?.inserted ?? null,
      error: options.members?.insertError ?? null,
    }),
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return {
        select: vi.fn(() => familiesSelectChain),
        insert: vi.fn(() => familiesInsertChain),
        update: vi.fn(() => familiesUpdateChain),
      };
    }
    if (table === "family_members") {
      return {
        insert: vi.fn(() => membersInsertChain),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from: fromMock,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

describe("createFamily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty family name with German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await createFamily("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gib einen Familiennamen ein");
    }
  });

  it("returns existing family when one already exists (idempotent)", async () => {
    const existing = { id: "fam-existing", name: "Bestehende Familie" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ families: { existing } }),
    );

    const result = await createFamily("Neue Familie");
    expect(result.success).toBe(true);
    if (result.success) {
      // Should return the existing family, NOT create a new one.
      expect(result.data.id).toBe("fam-existing");
      expect(result.data.name).toBe("Bestehende Familie");
    }
  });

  it("creates a new family when none exists", async () => {
    const inserted = { id: "fam-new", name: "Familie Müller" };
    const mock = mockSupabase({
      families: { existing: null, inserted },
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock);

    const result = await createFamily("Familie Müller");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("fam-new");
      expect(result.data.name).toBe("Familie Müller");
    }
  });

  it("returns friendly German error on insert failure", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: {
          existing: null,
          insertError: new Error("DB constraint violation"),
        },
      }),
    );

    const result = await createFamily("Familie Test");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });

  it("handles unique constraint violation (23505) by returning the existing family", async () => {
    // Race condition: pre-check sees no family, but a concurrent request
    // inserts one before our insert. The insert fails with code 23505
    // (unique_violation). The action should re-read and return the
    // existing family gracefully.
    const existingFamily = { id: "fam-race", name: "Familie Race" };
    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: {
          // First select (pre-check): no family exists.
          // Second select (re-read after constraint violation): family exists.
          selectResults: [
            { data: null, error: null },
            { data: existingFamily, error: null },
          ],
          insertError: uniqueViolation,
        },
      }),
    );

    const result = await createFamily("Familie Test");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("fam-race");
      expect(result.data.name).toBe("Familie Race");
    }
  });

  it("returns friendly German error when constraint violation re-read also fails", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: {
          // Pre-check: no family. Re-read: also returns null (e.g. RLS issue).
          selectResults: [
            { data: null, error: null },
            { data: null, error: null },
          ],
          insertError: uniqueViolation,
        },
      }),
    );

    const result = await createFamily("Familie Test");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await createFamily("Familie Test");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });
});

describe("addMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty member name with German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await addMember("fam-1", { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte einen Namen eingeben");
    }
  });

  it("creates a member with only a name (optional fields null)", async () => {
    const inserted = {
      id: "mem-1",
      family_id: "fam-1",
      name: "Emma",
      role: null,
      birthdate: null,
      avatar_color: null,
      created_at: "2026-07-04T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ members: { inserted } }),
    );

    const result = await addMember("fam-1", { name: "Emma" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Emma");
      expect(result.data.role).toBeNull();
    }
  });

  it("creates a member with all optional fields", async () => {
    const inserted = {
      id: "mem-2",
      family_id: "fam-1",
      name: "Thomas",
      role: "Vater",
      birthdate: "1985-06-15",
      avatar_color: "#E46018",
      created_at: "2026-07-04T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ members: { inserted } }),
    );

    const result = await addMember("fam-1", {
      name: "Thomas",
      role: "Vater",
      birthdate: "1985-06-15",
      avatar_color: "#E46018",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Thomas");
      expect(result.data.role).toBe("Vater");
      expect(result.data.birthdate).toBe("1985-06-15");
      expect(result.data.avatar_color).toBe("#E46018");
    }
  });

  it("returns friendly German error on insert failure", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        members: {
          insertError: new Error("FK violation"),
        },
      }),
    );

    const result = await addMember("fam-1", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await addMember("fam-1", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });
});

describe("completeOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets onboarding_completed_at on the user's family", async () => {
    const existing = { id: "fam-1", name: "Familie Müller", onboarding_completed_at: null };
    const updated = {
      id: "fam-1",
      name: "Familie Müller",
      onboarding_completed_at: "2026-07-06T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: { existing, updated },
      }),
    );

    const result = await completeOnboarding("fam-1");
    expect(result.success).toBe(true);
  });

  it("returns friendly German error when the family does not exist", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: { existing: null },
      }),
    );

    const result = await completeOnboarding("fam-nonexistent");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });

  it("returns friendly German error on update failure", async () => {
    const existing = { id: "fam-1", name: "Familie Müller", onboarding_completed_at: null };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: {
          existing,
          updateError: new Error("Connection refused"),
        },
      }),
    );

    const result = await completeOnboarding("fam-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await completeOnboarding("fam-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });

  it("returns friendly German error when family lookup fails", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        families: {
          selectResults: [
            { data: null, error: new Error("Connection refused") },
          ],
        },
      }),
    );

    const result = await completeOnboarding("fam-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
    }
  });
});
