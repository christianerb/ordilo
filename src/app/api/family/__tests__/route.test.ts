import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireUser } = vi.hoisted(() => ({ mockRequireUser: vi.fn() }));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createClient: vi.fn() }));

import { DELETE } from "@/app/api/family/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const GENERIC_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
const USER = { id: "user-1" };
const OWNED_FAMILY = { id: "fam-1", name: "Familie Müller" };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/family", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authed() {
  mockRequireUser.mockResolvedValue({ user: USER, status: null, json: null });
}

function unauthenticated() {
  mockRequireUser.mockResolvedValue({
    user: null,
    status: 401,
    json: {
      error: "Nicht authentifiziert. Bitte erneut anmelden.",
      code: "UNAUTHENTICATED",
    },
  });
}

/**
 * Mock the RLS-scoped server client: the owned-family lookup, the
 * documents/family_members storage-path reads, and the family row delete
 * (RLS owner policy re-checks ownership at the database level).
 */
function mockServer(
  options: {
    family?: { id: string; name: string } | null;
    familyError?: unknown;
    documentPaths?: (string | null)[];
    avatarPaths?: (string | null)[];
    docsError?: unknown;
    membersError?: unknown;
    deleteError?: unknown;
  } = {},
) {
  const ownedMaybeSingle = vi.fn().mockResolvedValue({
    data: options.family ?? null,
    error: options.familyError ?? null,
  });
  const familiesDeleteEq = vi
    .fn()
    .mockResolvedValue({ error: options.deleteError ?? null });
  const documentsEq = vi.fn().mockResolvedValue({
    data: (options.documentPaths ?? []).map((file_url) => ({ file_url })),
    error: options.docsError ?? null,
  });
  const membersEq = vi.fn().mockResolvedValue({
    data: (options.avatarPaths ?? []).map((photo_url) => ({ photo_url })),
    error: options.membersError ?? null,
  });

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: ownedMaybeSingle })),
        })),
        delete: vi.fn(() => ({ eq: familiesDeleteEq })),
      };
    }
    if (table === "documents") {
      return { select: vi.fn(() => ({ eq: documentsEq })) };
    }
    if (table === "family_members") {
      return { select: vi.fn(() => ({ eq: membersEq })) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from: fromMock } as unknown as Awaited<
      ReturnType<typeof createServerClient>
    >,
    ownedMaybeSingle,
    familiesDeleteEq,
    documentsEq,
    membersEq,
  };
}

/** Mock the service-role client: storage removals + auth.admin.deleteUser. */
function mockAdmin(
  options: {
    removeDocumentsError?: unknown;
    removeAvatarsError?: unknown;
    deleteUserError?: unknown;
  } = {},
) {
  const removeDocuments = vi.fn().mockResolvedValue({
    data: null,
    error: options.removeDocumentsError ?? null,
  });
  const removeAvatars = vi.fn().mockResolvedValue({
    data: null,
    error: options.removeAvatarsError ?? null,
  });
  const deleteUser = vi
    .fn()
    .mockResolvedValue({ data: null, error: options.deleteUserError ?? null });

  const admin = {
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
  };
}

function setup(
  serverOptions: Parameters<typeof mockServer>[0] = {},
  adminOptions: Parameters<typeof mockAdmin>[0] = {},
) {
  const server = mockServer(serverOptions);
  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
    server.client,
  );
  const admin = mockAdmin(adminOptions);
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin.admin);
  return { server, admin };
}

describe("DELETE /api/family", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    unauthenticated();
    setup();

    const res = await DELETE(makeRequest({ confirmName: "Familie Müller" }));

    expect(res.status).toBe(401);
  });

  it("returns 403 when the user owns no family", async () => {
    authed();
    setup({ family: null });

    const res = await DELETE(makeRequest({ confirmName: "Familie Müller" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(
      "Nur die Person, die die Familie erstellt hat, kann sie löschen.",
    );
  });

  it("returns 400 when the confirmation name does not match", async () => {
    authed();
    setup({ family: OWNED_FAMILY });

    const res = await DELETE(makeRequest({ confirmName: "Falscher Name" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(
      "Der Name stimmt nicht mit dem Familiennamen überein.",
    );
  });

  it("deletes storage files, the family row, and the auth user on success", async () => {
    authed();
    const { server, admin } = setup(
      {
        family: OWNED_FAMILY,
        documentPaths: ["fam-1/doc1.pdf", "fam-1/doc2.pdf"],
        avatarPaths: ["fam-1/avatar1.jpg"],
      },
      {},
    );

    const res = await DELETE(makeRequest({ confirmName: "Familie Müller" }));

    expect(res.status).toBe(200);
    // Storage files removed from both private buckets.
    expect(admin.removeDocuments).toHaveBeenCalledWith([
      "fam-1/doc1.pdf",
      "fam-1/doc2.pdf",
    ]);
    expect(admin.removeAvatars).toHaveBeenCalledWith(["fam-1/avatar1.jpg"]);
    // Family row deleted by id (cascades all family-scoped data).
    expect(server.familiesDeleteEq).toHaveBeenCalledWith("id", "fam-1");
    // Auth user deleted (full account deletion).
    expect(admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("aborts before touching the DB when storage removal fails (P1)", async () => {
    authed();
    const { server, admin } = setup(
      { family: OWNED_FAMILY, documentPaths: ["fam-1/doc1.pdf"] },
      { removeDocumentsError: new Error("storage down") },
    );

    const res = await DELETE(makeRequest({ confirmName: "Familie Müller" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(GENERIC_ERROR);
    // The family row (and its file references) must survive so nothing is
    // orphaned and the user can retry.
    expect(server.familiesDeleteEq).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("does not delete the auth user when the family delete fails", async () => {
    authed();
    const { admin } = setup(
      { family: OWNED_FAMILY },
      {},
    );
    // Make the family row delete fail.
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServer({ family: OWNED_FAMILY, deleteError: new Error("DB error") })
        .client,
    );

    const res = await DELETE(makeRequest({ confirmName: "Familie Müller" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(GENERIC_ERROR);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("returns an error when the auth user delete fails (no false success) (P1)", async () => {
    authed();
    setup({ family: OWNED_FAMILY }, { deleteUserError: new Error("auth error") });

    const res = await DELETE(makeRequest({ confirmName: "Familie Müller" }));
    const body = await res.json();

    // The data is gone, but the failure must be reported — the UI must not
    // claim the account was deleted while the login still works.
    expect(res.status).toBe(500);
    expect(body.code).toBe("AUTH_DELETE_FAILED");
  });
});
