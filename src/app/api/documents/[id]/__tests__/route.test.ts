import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  embeddingToVectorString: vi.fn((emb: number[]) => `[${emb.join(",")}]`),
}));

import { PATCH } from "@/app/api/documents/[id]/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { ConfirmRpcEntity } from "@/types/database";

const DOCUMENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function params(id: string = DOCUMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    document_type: "letter",
    title: "Notiz zum Stundenlohn",
    summary: "Der Stundenlohn beträgt 17 EUR.",
    family_members: [{ person_id: "member-1", name: "Emma", confidence: 1 }],
    organizations: [],
    dates: [],
    amounts: [
      {
        amount: "17",
        currency: "EUR",
        label: "Stundenlohn",
        kind: "other" as const,
        value_date: null,
        confidence: 1,
      },
    ],
    suggested_category: "Unterlagen",
    tags: ["Stundenlohn"],
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request(`http://localhost/api/documents/${DOCUMENT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockServerClient({
  user = { id: "user-1" },
  docStatus = "confirmed",
  docFound = true,
  rpcResult = { status: "updated", document_id: DOCUMENT_ID },
  rpcError = null,
}: {
  user?: { id: string } | null;
  docStatus?: string;
  docFound?: boolean;
  rpcResult?: { status: string; document_id?: string } | null;
  rpcError?: unknown;
} = {}) {
  const rpcCalls: { fnName: string; params: Record<string, unknown> }[] = [];

  const documentsBuilder = {
    select: vi.fn(() => ({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: docFound
            ? {
                id: DOCUMENT_ID,
                family_id: FAMILY_ID,
                status: docStatus,
                title: "Notiz zum Stundenlohn",
              }
            : null,
          error: null,
        }),
      }),
    })),
  };

  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === "documents") return documentsBuilder;
      // The category canonicalization reads collections too; it is
      // best-effort, so an unmocked table simply falls back.
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn((fnName: string, rpcParams: Record<string, unknown>) => {
      rpcCalls.push({ fnName, params: rpcParams });
      return Promise.resolve({ data: rpcResult, error: rpcError });
    }),
  };

  return { client, rpcCalls };
}

function mockAdminClient(exists = true) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: exists ? { id: DOCUMENT_ID, family_id: FAMILY_ID } : null,
            error: null,
          }),
        }),
      }),
    })),
  };
}

describe("PATCH /api/documents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request", async () => {
    const { client } = mockServerClient({ user: null });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const response = await PATCH(request(validPayload()), params());

    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload", async () => {
    const { client } = mockServerClient();
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const response = await PATCH(
      request({ ...validPayload(), title: 42 }),
      params(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_PAYLOAD");
  });

  it("rejects a document that is not in the family book yet", async () => {
    const { client, rpcCalls } = mockServerClient({ docStatus: "analyzed" });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient() as never);

    const response = await PATCH(request(validPayload()), params());

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("INVALID_STATUS_TRANSITION");
    expect(rpcCalls).toHaveLength(0);
  });

  it("saves the corrected values through the update RPC", async () => {
    const { client, rpcCalls } = mockServerClient();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient() as never);

    const response = await PATCH(request(validPayload()), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "updated",
      document_id: DOCUMENT_ID,
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fnName).toBe("update_confirmed_document");

    const rpcParams = rpcCalls[0].params;
    expect(rpcParams.p_title).toBe("Notiz zum Stundenlohn");
    expect(rpcParams.p_summary).toBe("Der Stundenlohn beträgt 17 EUR.");
    expect(rpcParams.p_category).toBe("Unterlagen");

    const entities = rpcParams.p_entities as ConfirmRpcEntity[];
    const amount = entities.find((e) => e.entity_type === "amount");
    expect(amount?.entity_value).toBe("17 EUR");
    expect(amount?.amount_minor).toBe(1700);
    const person = entities.find((e) => e.entity_type === "person");
    expect(person?.entity_value).toBe("Emma");
  });

  it("never sends tasks or facts — those are edited where they live", async () => {
    const { client, rpcCalls } = mockServerClient();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient() as never);

    await PATCH(request(validPayload()), params());

    const rpcParams = rpcCalls[0].params;
    expect(rpcParams.p_tasks).toBeUndefined();
    expect(rpcParams.p_facts).toBeUndefined();
    const entities = rpcParams.p_entities as ConfirmRpcEntity[];
    expect(entities.every((e) => e.entity_type !== "task")).toBe(true);
  });

  it("reports a concurrent status change without failing the document", async () => {
    const { client } = mockServerClient({
      rpcResult: { status: "status_changed" },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient() as never);

    const response = await PATCH(request(validPayload()), params());

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("STATUS_CHANGED");
  });

  it("keeps the document readable when the RPC fails", async () => {
    const { client } = mockServerClient({
      rpcResult: null,
      rpcError: { message: "boom" },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient() as never);

    const response = await PATCH(request(validPayload()), params());

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("UPDATE_RPC_FAILED");
    // No status write at all — the document stays confirmed.
    expect(client.from).not.toHaveBeenCalledWith("documents_failed");
  });
});
