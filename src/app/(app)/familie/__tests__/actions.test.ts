import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server supabase client before importing actions.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock the service-role (admin) client used for privileged deletes.
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import {
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  updateFamilyName,
  deleteFamilyAccount,
} from "@/app/(app)/familie/actions";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
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
  membershipFamily?: { id: string; name: string; onboarding_completed_at: string | null } | null;
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
    // For the relationship ownership check (validateRelations).
    relatedMembers?: { id: string; family_id: string }[];
    relatedMembersError?: unknown;
  };
  relations?: {
    /** Rows returned when the relations of a member are read back. */
    rows?: {
      member_id: string;
      related_member_id: string | null;
      role: string;
      sort_order: number;
    }[];
    /** Rows of the OTHER people, for the reciprocal sync. */
    counterpartRows?: {
      id: string;
      member_id: string;
      related_member_id: string | null;
      role: string;
      sort_order: number;
    }[];
    insertError?: unknown;
    deleteError?: unknown;
  };
  familyNameUpdate?: {
    updated?: { name: string };
    updateError?: unknown;
  };
}) {
  const { user = { id: "user-1", email: "test@ordilo.test" } } = options;

  // families chain (for fetching the user's family): resolveUserFamily
  // looks up the OWNED family first (created_by = user, at most one row)
  // and falls back to the oldest membership for invite-only accounts.
  const familiesSelectChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.family ?? null,
      error: options.familyError ?? null,
    }),
  };

  // Invite-only fallback — the actions tests always exercise the owned
  // path, so this resolves null.
  const membershipsSelectChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.membershipFamily
        ? { families: options.membershipFamily }
        : null,
      error: null,
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

  // family_members select chain. `.eq(...).maybeSingle()` verifies the
  // member being edited (updateFamilyMember only); `.in(...)` is the
  // relationship ownership check (validateRelations), called by both
  // addFamilyMember and updateFamilyMember whenever a relation points at
  // someone.
  const membersSelectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.members?.existing ?? null,
      error: options.members?.existingError ?? null,
    }),
    in: vi.fn().mockResolvedValue({
      data: options.members?.relatedMembers ?? [],
      error: options.members?.relatedMembersError ?? null,
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

  // family_member_relations chains — relations are replaced wholesale
  // (delete, then insert), read back when a caller does not manage them,
  // and read again for the other people's side of each relationship.
  const relationRows = options.relations?.rows ?? [];
  const relationsSelectChain = {
    // `.eq(...)` is awaited directly (the before-state read), so the chain
    // has to be thenable as well as chainable.
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: options.relations?.counterpartRows ?? [],
      error: null,
    }),
    order: vi.fn().mockResolvedValue({ data: relationRows, error: null }),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
    ) => Promise.resolve({ data: relationRows, error: null }).then(resolve),
  };
  const relationsInsertMock = vi
    .fn()
    .mockResolvedValue({ error: options.relations?.insertError ?? null });
  const relationsDeleteChain = {
    eq: vi.fn().mockResolvedValue({ error: options.relations?.deleteError ?? null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return {
        select: vi.fn(() => familiesSelectChain),
        update: vi.fn(() => familiesUpdateChain),
      };
    }
    if (table === "family_member_relations") {
      return {
        select: vi.fn(() => relationsSelectChain),
        insert: relationsInsertMock,
        delete: vi.fn(() => relationsDeleteChain),
      };
    }

    if (table === "family_memberships") {
      return {
        select: vi.fn(() => membershipsSelectChain),
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

/**
 * Build a mock service-role (admin) client for deleteFamilyAccount: the
 * documents/family_members storage-path lookups, the families delete, the
 * storage removals, and the auth.admin.deleteUser call.
 */
function mockAdmin(options: {
  documentPaths?: (string | null)[];
  avatarPaths?: (string | null)[];
  deleteError?: unknown;
  deleteUserError?: unknown;
  membershipDeleteError?: unknown;
}) {
  const removeDocuments = vi.fn().mockResolvedValue({ data: null, error: null });
  const removeAvatars = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteUser = vi
    .fn()
    .mockResolvedValue({ data: null, error: options.deleteUserError ?? null });

  const documentsSelectChain = {
    eq: vi.fn().mockResolvedValue({
      data: (options.documentPaths ?? []).map((file_url) => ({ file_url })),
      error: null,
    }),
  };
  const membersSelectChain = {
    eq: vi.fn().mockResolvedValue({
      data: (options.avatarPaths ?? []).map((photo_url) => ({ photo_url })),
      error: null,
    }),
  };
  const familiesDeleteChain = {
    eq: vi.fn().mockResolvedValue({ error: options.deleteError ?? null }),
  };
  const membershipsDeleteChain = {
    eq: vi.fn().mockReturnThis(),
    error: options.membershipDeleteError ?? null,
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "documents") {
      return { select: vi.fn(() => documentsSelectChain) };
    }
    if (table === "family_members") {
      return { select: vi.fn(() => membersSelectChain) };
    }
    if (table === "families") {
      return { delete: vi.fn(() => familiesDeleteChain) };
    }
    if (table === "family_memberships") {
      return { delete: vi.fn(() => membershipsDeleteChain) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const admin = {
    from: fromMock,
    storage: {
      from: vi.fn((bucket: string) => ({
        remove: bucket === "documents" ? removeDocuments : removeAvatars,
      })),
    },
    auth: { admin: { deleteUser } },
  };

  return {
    admin: admin as unknown as ReturnType<typeof createAdminClient>,
    removeDocuments,
    removeAvatars,
    deleteUser,
    familiesDeleteEq: familiesDeleteChain.eq,
    membershipsDeleteEq: membershipsDeleteChain.eq,
  };
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

  it("creates a member with several relationships at once", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const emmaId = "11111111-1111-4111-8111-111111111111";
    const chrisId = "44444444-4444-4444-8444-444444444444";
    const inserted: Partial<MemberRow> = {
      id: "mem-3",
      family_id: "fam-1",
      name: "Karina",
      role: "Mutter",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          inserted,
          relatedMembers: [
            { id: emmaId, family_id: "fam-1" },
            { id: chrisId, family_id: "fam-1" },
          ],
        },
      }),
    );

    const result = await addFamilyMember({
      name: "Karina",
      relations: [
        { role: "Mutter", member_ids: [emmaId] },
        { role: "Partnerin", member_ids: [chrisId] },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relations).toEqual([
        { role: "Mutter", member_ids: [emmaId] },
        { role: "Partnerin", member_ids: [chrisId] },
      ]);
      // The first relation's role is mirrored onto the member row.
      expect(result.data.role).toBe("Mutter");
    }
  });

  it("rejects a relationship pointing at a different family's member", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "22222222-2222-4222-8222-222222222222";
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          relatedMembers: [{ id: relatedId, family_id: "fam-other" }],
        },
      }),
    );

    const result = await addFamilyMember({
      name: "Anna",
      relations: [{ role: "Partnerin", member_ids: [relatedId] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Beziehung konnte nicht gespeichert werden.");
    }
  });

  it("rejects a relationship pointing at an unknown member id", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: { relatedMembers: [] },
      }),
    );

    const result = await addFamilyMember({
      name: "Anna",
      relations: [
        { role: "Schwester", member_ids: ["33333333-3333-4333-8333-333333333333"] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Beziehung konnte nicht gespeichert werden.");
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
      mockSupabase({
        family,
        members: { existing: { id: selfId, family_id: "fam-1" } },
      }),
    );

    const result = await updateFamilyMember(selfId, {
      name: "Emma",
      relations: [{ role: "Schwester", member_ids: [selfId] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Eine Person kann keine Beziehung zu sich selbst haben.",
      );
    }
  });

  it("replaces the relationships and mirrors the first role onto the member", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "22222222-2222-4222-8222-222222222222";
    const updated: Partial<MemberRow> = {
      id: "mem-1",
      family_id: "fam-1",
      name: "Emma",
      role: "Schwester",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          relatedMembers: [{ id: relatedId, family_id: "fam-1" }],
          updated,
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", {
      name: "Emma",
      relations: [{ role: "Schwester", member_ids: [relatedId] }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relations).toEqual([
        { role: "Schwester", member_ids: [relatedId] },
      ]);
    }
  });

  it("keeps the stored relationships when the caller passes none", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "22222222-2222-4222-8222-222222222222";
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          updated: { id: "mem-1", family_id: "fam-1", name: "Emma", role: "Mutter" },
        },
        relations: {
          rows: [
            {
              member_id: "mem-1",
              related_member_id: relatedId,
              role: "Mutter",
              sort_order: 0,
            },
          ],
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", { name: "Emma" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relations).toEqual([
        { role: "Mutter", member_ids: [relatedId] },
      ]);
    }
  });

  it("rejects a relationship pointing at a different family's member", async () => {
    const family = { id: "fam-1", name: "Familie Müller", created_by: "user-1" };
    const relatedId = "33333333-3333-4333-8333-333333333333";
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        members: {
          existing: { id: "mem-1", family_id: "fam-1" },
          relatedMembers: [{ id: relatedId, family_id: "fam-other" }],
        },
      }),
    );

    const result = await updateFamilyMember("mem-1", {
      name: "Emma",
      relations: [{ role: "Mutter", member_ids: [relatedId] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Beziehung konnte nicht gespeichert werden.");
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

// ---------------------------------------------------------------------------
// deleteFamilyAccount
// ---------------------------------------------------------------------------

describe("deleteFamilyAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await deleteFamilyAccount("Familie Müller");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns a friendly error when the user has no family membership", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family: null }),
    );

    const result = await deleteFamilyAccount("Familie Müller");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("deletes an invited member's account without deleting the shared family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family: null,
        membershipFamily: {
          id: "shared-fam",
          name: "Familie Müller",
          onboarding_completed_at: "2026-08-01T00:00:00Z",
        },
      }),
    );
    const adminMock = mockAdmin({});
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      adminMock.admin,
    );

    const result = await deleteFamilyAccount("Familie Müller");

    expect(result.success).toBe(true);
    expect(adminMock.familiesDeleteEq).not.toHaveBeenCalled();
    expect(adminMock.membershipsDeleteEq).toHaveBeenCalledWith("family_id", "shared-fam");
    expect(adminMock.membershipsDeleteEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(adminMock.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns an error when the confirmation name does not match", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family: { id: "fam-1", name: "Familie Müller", created_by: "user-1" },
      }),
    );

    const result = await deleteFamilyAccount("Falscher Name");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Der Name stimmt nicht mit dem Familiennamen überein.",
      );
    }
  });

  it("deletes the family, storage files, and auth user on success", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family: { id: "fam-1", name: "Familie Müller", created_by: "user-1" },
      }),
    );
    const adminMock = mockAdmin({
      documentPaths: ["fam-1/doc1.pdf", "fam-1/doc2.pdf"],
      avatarPaths: ["fam-1/avatar1.jpg"],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      adminMock.admin,
    );

    const result = await deleteFamilyAccount("Familie Müller");

    expect(result.success).toBe(true);
    // Family row deleted by id (cascades all family-scoped data).
    expect(adminMock.familiesDeleteEq).toHaveBeenCalledWith("id", "fam-1");
    // Storage files removed from both private buckets.
    expect(adminMock.removeDocuments).toHaveBeenCalledWith([
      "fam-1/doc1.pdf",
      "fam-1/doc2.pdf",
    ]);
    expect(adminMock.removeAvatars).toHaveBeenCalledWith([
      "fam-1/avatar1.jpg",
    ]);
    // Auth user deleted (full account deletion).
    expect(adminMock.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns friendly German error when the family delete fails", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family: { id: "fam-1", name: "Familie Müller", created_by: "user-1" },
      }),
    );
    const adminMock = mockAdmin({ deleteError: new Error("DB error") });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      adminMock.admin,
    );

    const result = await deleteFamilyAccount("Familie Müller");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
    // The auth user must NOT be deleted when the family delete failed.
    expect(adminMock.deleteUser).not.toHaveBeenCalled();
  });

  it("still succeeds when the auth user delete fails (data already erased)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family: { id: "fam-1", name: "Familie Müller", created_by: "user-1" },
      }),
    );
    const adminMock = mockAdmin({ deleteUserError: new Error("auth error") });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      adminMock.admin,
    );

    const result = await deleteFamilyAccount("Familie Müller");
    expect(result.success).toBe(true);
  });
});
