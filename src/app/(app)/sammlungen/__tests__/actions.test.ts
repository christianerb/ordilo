import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server supabase client before importing actions.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import {
  createCollection,
  updateCollection,
  deleteCollection,
} from "@/app/(app)/sammlungen/actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];

const FRIENDLY_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Build a mock Supabase client with a configurable auth user and table
 * chain mocks for the `collections` and `documents` tables.
 */
function mockSupabase(options: {
  user?: { id: string; email: string } | null;
  family?: { id: string; name: string } | null;
  familyError?: unknown;
  collections?: {
    inserted?: Partial<CollectionRow>;
    insertError?: unknown;
    updated?: Partial<CollectionRow>;
    updateError?: unknown;
    deleteError?: unknown;
    // For update/delete: whether the collection exists and belongs to the family.
    existing?: { id: string; family_id: string; name: string } | null;
    existingError?: unknown;
  };
  documentsUpdateSpy?: () => void;
}) {
  const { user = { id: "user-1", email: "test@ordilo.test" } } = options;

  const familiesSelectChain = {
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.family ?? null,
      error: options.familyError ?? null,
    }),
  };

  const collectionsSelectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.collections?.existing ?? null,
      error: options.collections?.existingError ?? null,
    }),
  };

  const collectionsInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.collections?.inserted ?? null,
      error: options.collections?.insertError ?? null,
    }),
  };

  const collectionsUpdateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.collections?.updated ?? null,
      error: options.collections?.updateError ?? null,
    }),
  };

  const collectionsDeleteChain = {
    eq: vi.fn().mockReturnThis(),
    error: options.collections?.deleteError ?? null,
  };

  const documentsUpdateSpy = options.documentsUpdateSpy ?? (() => {});
  const documentsUpdateChain = {
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return {
        select: vi.fn(() => familiesSelectChain),
      };
    }
    if (table === "collections") {
      return {
        select: vi.fn(() => collectionsSelectChain),
        insert: vi.fn(() => collectionsInsertChain),
        update: vi.fn(() => collectionsUpdateChain),
        delete: vi.fn(() => collectionsDeleteChain),
      };
    }
    if (table === "documents") {
      documentsUpdateSpy();
      return {
        update: vi.fn(() => documentsUpdateChain),
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

const VALID_INPUT = { name: "Versicherungen", icon: "shield", color: "petrol" };

// ---------------------------------------------------------------------------
// createCollection
// ---------------------------------------------------------------------------

describe("createCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty name with German validation message", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await createCollection({ ...VALID_INPUT, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gib einen Namen ein");
    }
  });

  it("rejects an unknown icon key", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({}),
    );

    const result = await createCollection({ ...VALID_INPUT, icon: "nope" });
    expect(result.success).toBe(false);
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await createCollection(VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when user has no family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family: null }),
    );

    const result = await createCollection(VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("creates a collection with the given name, icon, and color", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    const inserted: Partial<CollectionRow> = {
      id: "col-1",
      family_id: "fam-1",
      name: "Versicherungen",
      icon: "shield",
      color: "petrol",
      sort_order: 0,
      created_at: "2026-07-07T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family, collections: { inserted } }),
    );

    const result = await createCollection(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Versicherungen");
      expect(result.data.icon).toBe("shield");
      expect(result.data.color).toBe("petrol");
    }
  });

  it("returns a friendly duplicate-name error on unique violation", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: { insertError: uniqueViolation },
      }),
    );

    const result = await createCollection(VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Diese Sammlung gibt es schon.");
    }
  });

  it("returns friendly German error on insert failure", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: { insertError: new Error("DB error") },
      }),
    );

    const result = await createCollection(VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });
});

// ---------------------------------------------------------------------------
// updateCollection
// ---------------------------------------------------------------------------

describe("updateCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns friendly German error when collection does not exist", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ family, collections: { existing: null } }),
    );

    const result = await updateCollection("col-missing", VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when collection belongs to a different family", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-other", name: "Schule" },
        },
      }),
    );

    const result = await updateCollection("col-1", VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("updates name, icon, and color", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    const updated: Partial<CollectionRow> = {
      id: "col-1",
      family_id: "fam-1",
      name: "Versicherungen",
      icon: "shield",
      color: "petrol",
      sort_order: 0,
      created_at: "2026-07-07T10:00:00Z",
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-1", name: "Schule" },
          updated,
        },
      }),
    );

    const result = await updateCollection("col-1", VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Versicherungen");
    }
  });

  it("cascades the rename onto matching documents when the name changes", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    const updated: Partial<CollectionRow> = {
      id: "col-1",
      family_id: "fam-1",
      name: "Versicherungen",
      icon: "shield",
      color: "petrol",
      sort_order: 0,
      created_at: "2026-07-07T10:00:00Z",
    };
    const documentsUpdateSpy = vi.fn();
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-1", name: "Schule" },
          updated,
        },
        documentsUpdateSpy,
      }),
    );

    await updateCollection("col-1", VALID_INPUT);
    expect(documentsUpdateSpy).toHaveBeenCalled();
  });

  it("does not touch documents when the name is unchanged", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    const updated: Partial<CollectionRow> = {
      id: "col-1",
      family_id: "fam-1",
      name: "Schule",
      icon: "heart",
      color: "destructive",
      sort_order: 0,
      created_at: "2026-07-07T10:00:00Z",
    };
    const documentsUpdateSpy = vi.fn();
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-1", name: "Schule" },
          updated,
        },
        documentsUpdateSpy,
      }),
    );

    await updateCollection("col-1", { name: "Schule", icon: "heart", color: "destructive" });
    expect(documentsUpdateSpy).not.toHaveBeenCalled();
  });

  it("returns a friendly duplicate-name error on unique violation", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-1", name: "Schule" },
          updateError: uniqueViolation,
        },
      }),
    );

    const result = await updateCollection("col-1", VALID_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Diese Sammlung gibt es schon.");
    }
  });
});

// ---------------------------------------------------------------------------
// deleteCollection
// ---------------------------------------------------------------------------

describe("deleteCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns friendly German error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({ user: null }),
    );

    const result = await deleteCollection("col-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("returns friendly German error when collection belongs to a different family", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-other", name: "Schule" },
        },
      }),
    );

    const result = await deleteCollection("col-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });

  it("deletes the collection when it belongs to the user's family", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-1", name: "Schule" },
          deleteError: null,
        },
      }),
    );

    const result = await deleteCollection("col-1");
    expect(result.success).toBe(true);
  });

  it("returns friendly German error on delete failure", async () => {
    const family = { id: "fam-1", name: "Familie Müller" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabase({
        family,
        collections: {
          existing: { id: "col-1", family_id: "fam-1", name: "Schule" },
          deleteError: new Error("DB error"),
        },
      }),
    );

    const result = await deleteCollection("col-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(FRIENDLY_ERROR);
    }
  });
});
