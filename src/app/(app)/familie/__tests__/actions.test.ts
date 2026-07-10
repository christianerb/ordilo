import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server supabase client before importing actions.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import {
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  updateFamilyName,
} from "@/app/(app)/familie/actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/** Friendly German error used for unexpected failures. */
const FRIENDLY_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Build a mock Supabase client with a configurable auth user and a set of
 * table chain mocks for the family_members table.
 */
function mockSupabase(options: {
  user?: { id: string; email: string } | null;
  family?: { id: string; name: string; created_by: string } | null;
  familyError?: unknown;
  members?: {
    inserted?: Partial<MemberRow>;
    insertError?: unknown;
    updated?: Partial<MemberRow>;
    updateError?: unknown;
    deleted?: boolean;
    deleteError?: unknown;
    // For update/remove: whether the member exists and belongs to the family.
    existing?: { id: string; family_id: string } | null;
    existingError?: unknown;
    // For the related-member ownership check (verifyRelatedMember). Defaults
    // to `existing` when not set, since most tests only care about one of
    // the two `family_members` select calls.
    relatedMember?: { id: string; family_id: string } | null;
    relatedMemberError?: unknown;
  };
  familyNameUpdate?: {
    updated?: { name: string };
    updateError?: unknown;
  };
}) {
  const { user = { id: "user-1", email: "test@ordilo.test" } } = options;

  // families chain (for fetching the user's family)
  const familiesSelectChain = {
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.family ?? null,
      error: options.familyError ?? null,
    }),
  };

  // families update chain (for renaming the family)
  const familiesUpdateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.familyNameUpdate?.updated ?? null,
      error: options.familyNameUpdate?.updateError ?? null,
    }),
  };

  // family_members select chain (for finding a member by id within the
  // family). `updateFamilyMember` calls this twice — once to verify the
  // member being edited, once (via verifyRelatedMember) to verify a
  // referenced related member — while `addFamilyMember` only ever calls
  // it once (the related-member check, no pre-existing member to verify).
  // When the test explicitly sets `existing`, the first call returns it
  // and any later call returns `relatedMember` (falling back to
  // `existing`); otherwise every call returns `relatedMember` directly.
  let membersSelectCallCount = 0;
  const hasExisting = Object.prototype.hasOwnProperty.call(
    options.members ?? {},
    "existing",
  );
  const membersSelectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      membersSelectCallCount += 1;
      if (hasExisting && membersSelectCallCount === 1) {
        return Promise.resolve({
          data: options.members?.existing ?? null,
          error: options.members?.existingError ?? null,
        });
      }
      return Promise.resolve({
        data: options.members?.relatedMember ?? options.members?.existing ?? null,
        error: options.members?.relatedMemberError ?? null,
      });
    }),
  };

  // family_members insert chain
  const membersInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.members?.inserted ?? null,
      error: options.members?.insertError ?? null,
    }),
  };

  // family_members update chain
  const membersUpdateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.members?.updated ?? null,
      error: options.members?.updateError ?? null,
    }),
  };

  // family_members delete chain
  const membersDeleteChain = {
    eq: vi.fn().mockReturnThis(),
    error: options.members?.deleteError ?? null,
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return {
        select: vi.fn(() => familiesSelectChain),
        update: vi.fn(() => familiesUpdateChain),
      };
    }
    if (table === "family_members") {
      return {
        select: vi.fn(() => membersSelectChain),
        insert: vi.fn(() => membersInsertChain),
        update: vi.fn(() => membersUpdateChain),
        delete: vi.fn(() => membersDeleteChain),
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

// ---------------------------------------------------------------------------
// addFamilyMember
// ---------------------------------------------------------------------------

describe("addFamilyMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty name with German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await addFamilyMember({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte einen Namen eingeben");
    }
  });

  it("rejects whitespace-only name with German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await addFamilyMember({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte einen Namen eingeben");
    }
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await addFamilyMember({ name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when user has no family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family: null }),
    );

    const result = await addFamilyMember({ name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("creates a member with only a name (optional fields null)", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const inserted: Partial<MemberRow> = {
      id: "mem-1",
      family_id: "fam-1",
      name: "Emma",
      role: null,
      birthdate: null,
      avatar_color: null,
      created_at: "2026-07-04T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family, members: { inserted } }),
    );

    const result = await addFamilyMember({ name: "Emma" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Emma");
      expect(result.data.role).toBeNull();
      expect(result.data.birthdate).toBeNull();
      expect(result.data.avatar_color).toBeNull();
    }
  });

  it("creates a member with all optional fields", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const inserted: Partial<MemberRow> = {
      id: "mem-2",
      family_id: "fam-1",
      name: "Thomas",
      role: "Vater",
      birthdate: "1985-06-15",
      avatar_color: "#E46018",
      created_at: "2026-07-04T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family, members: { inserted } }),
    );

    const result = await addFamilyMember({
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
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: { insertError: new Error("DB error") },
      }),
    );

    const result = await addFamilyMember({ name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("creates a member with a related member and relationship label", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "11111111-1111-4111-8111-111111111111";
    const inserted: Partial<MemberRow> = {
      id: "mem-3",
      family_id: "fam-1",
      name: "Anna",
      related_member_id: relatedId,
      relationship_label: "Ehepartner",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          inserted,
          relatedMember: { id: relatedId, family_id: "fam-1" },
        },
      }),
    );

    const result = await addFamilyMember({
      name: "Anna",
      related_member_id: relatedId,
      relationship_label: "Ehepartner",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.related_member_id).toBe(relatedId);
      expect(result.data.relationship_label).toBe("Ehepartner");
    }
  });

  it("rejects a related member from a different family", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "22222222-2222-4222-8222-222222222222";
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          relatedMember: { id: relatedId, family_id: "fam-other" },
        },
      }),
    );

    const result = await addFamilyMember({
      name: "Anna",
      related_member_id: relatedId,
      relationship_label: "Ehepartner",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("rejects an unknown related member id", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: { relatedMember: null },
      }),
    );

    const result = await addFamilyMember({
      name: "Anna",
      related_member_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });
});

// ---------------------------------------------------------------------------
// updateFamilyMember
// ---------------------------------------------------------------------------

describe("updateFamilyMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty name with German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await updateFamilyMember("mem-1", { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte einen Namen eingeben");
    }
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await updateFamilyMember("mem-1", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when user has no family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family: null }),
    );

    const result = await updateFamilyMember("mem-1", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when member does not exist", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family, members: { existing: null } }),
    );

    const result = await updateFamilyMember("mem-missing", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when member belongs to a different family", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    // The member exists but belongs to a different family.
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: { existing: { id: "mem-1", family_id: "fam-other" } },
      }),
    );

    const result = await updateFamilyMember("mem-1", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("updates a member with new values", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const updated: Partial<MemberRow> = {
      id: "mem-1",
      family_id: "fam-1",
      name: "EmmaUpdated",
      role: "Tochter",
      birthdate: "2018-03-12",
      avatar_color: "#E46018",
      created_at: "2026-07-04T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          updated,
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", {
      name: "EmmaUpdated",
      role: "Tochter",
      birthdate: "2018-03-12",
      avatar_color: "#E46018",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("EmmaUpdated");
      expect(result.data.role).toBe("Tochter");
    }
  });

  it("updates a member clearing optional fields (empty → null)", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const updated: Partial<MemberRow> = {
      id: "mem-1",
      family_id: "fam-1",
      name: "Emma",
      role: null,
      birthdate: null,
      avatar_color: null,
      created_at: "2026-07-04T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          updated,
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", {
      name: "Emma",
      role: "",
      birthdate: "",
      avatar_color: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBeNull();
      expect(result.data.birthdate).toBeNull();
      expect(result.data.avatar_color).toBeNull();
    }
  });

  it("returns friendly German error on update failure", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          updateError: new Error("DB error"),
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", { name: "Emma" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("rejects a member being related to itself", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const selfId = "11111111-1111-4111-8111-111111111111";
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family }),
    );

    const result = await updateFamilyMember(selfId, {
      name: "Emma",
      related_member_id: selfId,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("updates a member with a related member and relationship label", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "22222222-2222-4222-8222-222222222222";
    const updated: Partial<MemberRow> = {
      id: "mem-1",
      family_id: "fam-1",
      name: "Emma",
      related_member_id: relatedId,
      relationship_label: "Schwester",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          relatedMember: { id: relatedId, family_id: "fam-1" },
          updated,
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", {
      name: "Emma",
      related_member_id: relatedId,
      relationship_label: "Schwester",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.related_member_id).toBe(relatedId);
      expect(result.data.relationship_label).toBe("Schwester");
    }
  });

  it("rejects a related member from a different family", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "33333333-3333-4333-8333-333333333333";
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          relatedMember: { id: relatedId, family_id: "fam-other" },
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", {
      name: "Emma",
      related_member_id: relatedId,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });
});

// ---------------------------------------------------------------------------
// removeFamilyMember
// ---------------------------------------------------------------------------

describe("removeFamilyMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await removeFamilyMember("mem-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when user has no family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family: null }),
    );

    const result = await removeFamilyMember("mem-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when member does not exist", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family, members: { existing: null } }),
    );

    const result = await removeFamilyMember("mem-missing");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when member belongs to a different family", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: { existing: { id: "mem-1", family_id: "fam-other" } },
      }),
    );

    const result = await removeFamilyMember("mem-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("deletes the member when it belongs to the user's family", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          deleteError: null,
        },
      }),
    );

    const result = await removeFamilyMember("mem-1");
    expect(result.success).toBe(true);
  });

  it("returns friendly German error on delete failure", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          deleteError: new Error("DB error"),
        },
      }),
    );

    const result = await removeFamilyMember("mem-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });
});

// ---------------------------------------------------------------------------
// updateFamilyName
// ---------------------------------------------------------------------------

describe("updateFamilyName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty name with a German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await updateFamilyName("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gib einen Familiennamen ein");
    }
  });

  it("rejects a name longer than 100 characters", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await updateFamilyName("a".repeat(101));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Der Familienname ist zu lang (maximal 100 Zeichen)",
      );
    }
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await updateFamilyName("Familie Schmidt");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when user has no family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family: null }),
    );

    const result = await updateFamilyName("Familie Schmidt");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("renames the family on success", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        familyNameUpdate: { updated: { name: "Familie Schmidt" } },
      }),
    );

    const result = await updateFamilyName("Familie Schmidt");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Familie Schmidt");
    }
  });

  it("returns friendly German error on update failure", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        familyNameUpdate: { updateError: new Error("DB error") },
      }),
    );

    const result = await updateFamilyName("Familie Schmidt");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });
});
