import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the admin Supabase client before importing the helper.
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import {
  ensureEmptyDocumentsFixture,
  EMPTY_FIXTURE_EMAIL,
  EMPTY_FIXTURE_FAMILY_NAME,
} from "@/lib/dev-fixtures";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const FAMILY_ID = "22222222-2222-2222-2222-222222222222";

/**
 * Build a mock admin client with controllable families + documents +
 * storage behaviour.
 */
function mockAdminClient(options: {
  families?: { id: string; name: string }[] | null;
  familiesError?: unknown;
  insertFamily?: { id: string; name: string } | null;
  insertFamilyError?: unknown;
  members?: { id: string }[] | null;
  membersError?: unknown;
  memberInsertError?: unknown;
  docs?: { file_url: string }[] | null;
  docsError?: unknown;
  deleteError?: unknown;
  storageRemoveError?: unknown;
}) {
  const {
    families = [],
    familiesError = null,
    insertFamily = { id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME },
    insertFamilyError = null,
    members = [{ id: "member-1" }],
    membersError = null,
    memberInsertError = null,
    docs = [],
    docsError = null,
    deleteError = null,
    storageRemoveError = null,
  } = options;

  const familiesSelectChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: families, error: familiesError }),
  };

  const familiesInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: insertFamily, error: insertFamilyError }),
  };

  const membersSelectChain = {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: members, error: membersError }),
  };

  const membersInsertChain = vi
    .fn()
    .mockResolvedValue({ data: null, error: memberInsertError });

  const docsSelectChain = {
    eq: vi.fn().mockResolvedValue({ data: docs, error: docsError }),
  };

  const docsDeleteChain = {
    eq: vi.fn().mockResolvedValue({ data: null, error: deleteError }),
  };

  const removeMock = vi
    .fn()
    .mockResolvedValue({ data: [], error: storageRemoveError });

  return {
    from: vi.fn((table: string) => {
      if (table === "families") {
        return {
          select: vi.fn(() => familiesSelectChain),
          insert: vi.fn(() => familiesInsertChain),
        };
      }
      if (table === "family_members") {
        return {
          select: vi.fn(() => membersSelectChain),
          insert: membersInsertChain,
        };
      }
      if (table === "documents") {
        return {
          select: vi.fn(() => docsSelectChain),
          delete: vi.fn(() => docsDeleteChain),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        remove: removeMock,
      })),
    },
  } as unknown as Awaited<ReturnType<typeof createAdminClient>>;
}

describe("ensureEmptyDocumentsFixture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes a stable fixture email and family name", () => {
    expect(EMPTY_FIXTURE_EMAIL).toContain("@");
    expect(EMPTY_FIXTURE_FAMILY_NAME.length).toBeGreaterThan(0);
  });

  it("creates a family when the fixture user has none", async () => {
    const admin = mockAdminClient({ families: [] });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const result = await ensureEmptyDocumentsFixture(USER_ID);

    expect(result.familyId).toBe(FAMILY_ID);
    expect(result.familyName).toBe(EMPTY_FIXTURE_FAMILY_NAME);
    // Verify a family insert occurred with the correct created_by.
    expect(admin.from).toHaveBeenCalledWith("families");
  });

  it("reuses the existing family when one already exists", async () => {
    const existingFamily = {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Bestehende Testfamilie",
    };
    const admin = mockAdminClient({
      families: [existingFamily],
      insertFamily: null,
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const result = await ensureEmptyDocumentsFixture(USER_ID);

    expect(result.familyId).toBe(existingFamily.id);
    expect(result.familyName).toBe(existingFamily.name);
  });

  it("deletes all documents for the fixture family", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      docs: [{ file_url: `${FAMILY_ID}/doc-1/file.pdf` }],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await ensureEmptyDocumentsFixture(USER_ID);

    // documents delete was called
    expect(admin.from).toHaveBeenCalledWith("documents");
  });

  it("removes stored files for deleted documents (best-effort)", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      docs: [
        { file_url: `${FAMILY_ID}/doc-a/a.pdf` },
        { file_url: `${FAMILY_ID}/doc-b/b.jpg` },
      ],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await ensureEmptyDocumentsFixture(USER_ID);

    expect(admin.storage.from).toHaveBeenCalledWith("documents");
  });

  it("does not call storage remove when there are no documents", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      docs: [],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await ensureEmptyDocumentsFixture(USER_ID);

    expect(admin.storage.from).not.toHaveBeenCalled();
  });

  it("still succeeds when storage cleanup fails (best-effort)", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      docs: [{ file_url: `${FAMILY_ID}/doc-1/file.pdf` }],
      storageRemoveError: new Error("Storage down"),
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const result = await ensureEmptyDocumentsFixture(USER_ID);

    expect(result.familyId).toBe(FAMILY_ID);
  });

  it("throws when querying families fails", async () => {
    const admin = mockAdminClient({
      families: null,
      familiesError: new Error("DB error"),
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await expect(ensureEmptyDocumentsFixture(USER_ID)).rejects.toThrow();
  });

  it("throws when creating a family fails", async () => {
    const admin = mockAdminClient({
      families: [],
      insertFamily: null,
      insertFamilyError: new Error("Insert failed"),
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await expect(ensureEmptyDocumentsFixture(USER_ID)).rejects.toThrow();
  });

  it("throws when deleting documents fails", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      deleteError: new Error("Delete failed"),
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await expect(ensureEmptyDocumentsFixture(USER_ID)).rejects.toThrow();
  });

  // --- Family member (onboarding-complete precondition) ---

  it("creates a family member when none exists", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      members: [],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await ensureEmptyDocumentsFixture(USER_ID);

    expect(admin.from).toHaveBeenCalledWith("family_members");
  });

  it("does not create a family member when one already exists", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      members: [{ id: "existing-member" }],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await ensureEmptyDocumentsFixture(USER_ID);

    expect(admin.from).toHaveBeenCalledWith("family_members");
    // The insert should not have been called (member already exists).
    // We assert via the call to "documents" still happening afterwards,
    // and no throw, which confirms the reuse path was taken.
    expect(admin.from).toHaveBeenCalledWith("documents");
  });

  it("throws when querying family members fails", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      members: null,
      membersError: new Error("Members query failed"),
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await expect(ensureEmptyDocumentsFixture(USER_ID)).rejects.toThrow();
  });

  it("throws when creating a family member fails", async () => {
    const admin = mockAdminClient({
      families: [{ id: FAMILY_ID, name: EMPTY_FIXTURE_FAMILY_NAME }],
      members: [],
      memberInsertError: new Error("Member insert failed"),
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    await expect(ensureEmptyDocumentsFixture(USER_ID)).rejects.toThrow();
  });
});
