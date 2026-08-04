import { describe, it, expect, vi } from "vitest";

// Mock the supabase server client before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { PATCH } from "@/app/api/documents/[id]/person/route";
import { createClient as createServerClient } from "@/lib/supabase/server";

const VALID_DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function createParams(id: string = VALID_DOC_ID) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(body: unknown) {
  return new Request(`http://localhost/api/documents/${VALID_DOC_ID}/person`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Mock the RLS-scoped server client for the route's three query shapes:
 * the document read, the family-member ownership check, and the
 * extracted_entities delete + insert.
 */
function mockServerClient({
  user = { id: "user-1" },
  document = { id: VALID_DOC_ID, family_id: FAMILY_ID },
  familyMemberIds = ["member-1", "member-2"],
  deleteError = null,
  insertError = null,
}: {
  user?: { id: string } | null;
  document?: { id: string; family_id: string } | null;
  familyMemberIds?: string[];
  deleteError?: unknown;
  insertError?: unknown;
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const deleteEq2 = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 });
  const del = vi.fn().mockReturnValue({ eq: deleteEq1 });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: document, error: null }),
            }),
          }),
        };
      }
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: familyMemberIds.map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "extracted_entities") {
        return { delete: del, insert };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    client: client as unknown as Awaited<ReturnType<typeof createServerClient>>,
    insert,
    del,
    deleteEq1,
    deleteEq2,
  };
}

describe("PATCH /api/documents/[id]/person", () => {
  it("returns 401 when not authenticated", async () => {
    const { client } = mockServerClient({ user: null });
    vi.mocked(createServerClient).mockResolvedValue(client);

    const response = await PATCH(
      createRequest({ persons: [] }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the document does not exist (or is not owned)", async () => {
    const { client } = mockServerClient({ document: null });
    vi.mocked(createServerClient).mockResolvedValue(client);

    const response = await PATCH(
      createRequest({ persons: [] }),
      createParams(),
    );

    expect(response.status).toBe(404);
  });

  it("rejects a malformed persons payload", async () => {
    const { client } = mockServerClient();
    vi.mocked(createServerClient).mockResolvedValue(client);

    const response = await PATCH(
      createRequest({ persons: [{ name: "" }] }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("rejects a person_id that does not belong to the document's family", async () => {
    const { client } = mockServerClient({ familyMemberIds: ["member-1"] });
    vi.mocked(createServerClient).mockResolvedValue(client);

    const response = await PATCH(
      createRequest({
        persons: [{ name: "Max", person_id: "someone-elses-member" }],
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("PERSON_NOT_IN_FAMILY");
  });

  it("replaces the document's person entities with the given assignment", async () => {
    const { client, del, deleteEq1, deleteEq2, insert } = mockServerClient({
      familyMemberIds: ["member-2"],
    });
    vi.mocked(createServerClient).mockResolvedValue(client);

    const response = await PATCH(
      createRequest({ persons: [{ name: "Hanna", person_id: "member-2" }] }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(del).toHaveBeenCalled();
    expect(deleteEq1).toHaveBeenCalledWith("document_id", VALID_DOC_ID);
    expect(deleteEq2).toHaveBeenCalledWith("entity_type", "person");
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        document_id: VALID_DOC_ID,
        family_id: FAMILY_ID,
        entity_type: "person",
        entity_value: "Hanna",
        linked_object_id: "member-2",
        confirmed: true,
      }),
    ]);

    const body = await response.json();
    expect(body.persons).toEqual([{ name: "Hanna", person_id: "member-2" }]);
  });

  it("clears the assignment (no insert) when persons is empty", async () => {
    const { client, del, insert } = mockServerClient();
    vi.mocked(createServerClient).mockResolvedValue(client);

    const response = await PATCH(
      createRequest({ persons: [] }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(del).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
