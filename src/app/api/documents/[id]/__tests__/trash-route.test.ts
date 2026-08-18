import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { DELETE } from "../route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const DOCUMENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function context() {
  return { params: Promise.resolve({ id: DOCUMENT_ID }) };
}

function mockClient(result: string) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: DOCUMENT_ID, file_url: "family/doc/file.pdf" },
            error: null,
          }),
        })),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "user-1" } } as never);
});

describe("DELETE /api/documents/[id]", () => {
  it("moves an idle document into the paper bin", async () => {
    const client = mockClient("trashed");
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await DELETE(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("trash_document", {
      p_document_id: DOCUMENT_ID,
    });
  });

  it("asks the user to wait while processing is active", async () => {
    vi.mocked(createClient).mockResolvedValue(mockClient("busy") as never);

    const response = await DELETE(new Request("http://localhost"), context());

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("DOCUMENT_BUSY");
  });
});
