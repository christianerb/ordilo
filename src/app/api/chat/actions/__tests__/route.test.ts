import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/tools", () => ({
  executeTool: vi.fn(),
}));

import { POST } from "@/app/api/chat/actions/route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { executeTool } from "@/lib/ai/tools";

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function request(body: unknown) {
  return new Request("http://localhost/api/chat/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: "user-1" } as never,
    status: null,
    json: null,
  });
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { family_id: FAMILY_ID },
        error: null,
      }),
    })),
  } as never);
});

describe("POST /api/chat/actions", () => {
  it("executes only the action the user explicitly accepted", async () => {
    vi.mocked(executeTool).mockResolvedValue(
      JSON.stringify({
        success: true,
        task_id: "task-1",
        message: "Aufgabe angelegt.",
      }),
    );

    const response = await POST(
      request({
        family_id: FAMILY_ID,
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken", confirmed: false },
      }),
    );

    expect(response.status).toBe(200);
    expect(executeTool).toHaveBeenCalledWith(
      "add_task",
      expect.objectContaining({
        title: "Anmeldung abschicken",
        confirmed: true,
      }),
      expect.objectContaining({ familyId: FAMILY_ID }),
    );
  });

  it("rejects an action for a family the user does not belong to", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    } as never);

    const response = await POST(
      request({
        family_id: FAMILY_ID,
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken" },
      }),
    );

    expect(response.status).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });
});
