import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server supabase client before importing actions.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createFamily, addMember } from "@/app/(app)/onboarding/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Build a mock Supabase client with a configurable auth user and a set of
 * table chain mocks. Each table mock supports the select/insert/limit/
 * maybeSingle/single chain used by the actions.
 */
function mockSupabase(options: {
  user?: { id: string; email: string } | null;
  families?: {
    existing?: { id: string; name: string } | null;
    insertError?: unknown;
    inserted?: { id: string; name: string };
  };
  members?: {
    insertError?: unknown;
    inserted?: Record<string, unknown>;
  };
}) {
  const { user = { id: "user-1", email: "test@ordilo.test" } } = options;

  // families chain
  const familiesSelectChain = {
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.families?.existing ?? null,
      error: null,
    }),
  };
  const familiesInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.families?.inserted ?? null,
      error: options.families?.insertError ?? null,
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
