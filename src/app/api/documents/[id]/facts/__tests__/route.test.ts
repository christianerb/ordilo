import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST, PATCH, DELETE } from "@/app/api/documents/[id]/facts/route";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DOCUMENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

const INSERTED_FACT = {
  id: "fact-1",
  fact_type: "serial_number",
  label: "Seriennummer",
  value: "SN 4823-XK",
};

function params(id: string = DOCUMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown, method = "POST") {
  return new Request(`http://localhost/api/documents/${DOCUMENT_ID}/facts`, {
    method,
    body: JSON.stringify(body),
  });
}

function mockServerClient({
  user = { id: "user-1" },
  insertResult = { data: INSERTED_FACT, error: null },
  deleteResult = { error: null },
}: {
  user?: { id: string } | null;
  insertResult?: { data: unknown; error: unknown };
  deleteResult?: { error: unknown };
} = {}) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(insertResult),
    }),
  });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  });
  const deleteFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(deleteResult),
    }),
  });
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: DOCUMENT_ID, family_id: FAMILY_ID },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "document_facts") {
        return { insert, update, delete: deleteFn };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { client, insert, update, deleteFn };
}

function mockClient(client: unknown) {
  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);
}

describe("/api/documents/[id]/facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST returns 400 for an unknown fact_type", async () => {
    mockClient(mockServerClient().client);

    const response = await POST(
      request({ fact_type: "bogus", value: "123" }),
      params(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bitte gib eine gültige Nummer und ihren Typ an.",
      code: "INVALID_INPUT",
    });
  });

  it("POST returns 400 for an empty value", async () => {
    mockClient(mockServerClient().client);

    const response = await POST(
      request({ fact_type: "serial_number", value: "   " }),
      params(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bitte gib eine gültige Nummer und ihren Typ an.",
      code: "INVALID_INPUT",
    });
  });

  it("POST inserts a confirmed fact with the default label", async () => {
    const { client, insert } = mockServerClient();
    mockClient(client);

    const response = await POST(
      request({ fact_type: "serial_number", value: "SN 4823-XK" }),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      fact: INSERTED_FACT,
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: DOCUMENT_ID,
        family_id: FAMILY_ID,
        fact_type: "serial_number",
        label: "Seriennummer",
        value: "SN 4823-XK",
        normalized_value: "sn4823xk",
        confidence: 1.0,
        confirmed: true,
      }),
    );
  });

  it("PATCH returns 400 without a new value", async () => {
    mockClient(mockServerClient().client);

    const response = await PATCH(
      request({ fact_id: "fact-1" }, "PATCH"),
      params(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bitte gib die Nummer und einen neuen Wert an.",
      code: "INVALID_INPUT",
    });
  });

  it("DELETE returns 400 without a fact_id", async () => {
    mockClient(mockServerClient().client);

    const response = await DELETE(request({}, "DELETE"), params());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bitte gib an, welche Nummer entfernt werden soll.",
      code: "INVALID_INPUT",
    });
  });

  it("DELETE removes the fact", async () => {
    const { client, deleteFn } = mockServerClient();
    mockClient(client);

    const response = await DELETE(
      request({ fact_id: "fact-1" }, "DELETE"),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(deleteFn).toHaveBeenCalled();
  });
});
