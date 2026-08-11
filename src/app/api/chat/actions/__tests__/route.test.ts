import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/tools", () => ({
  executeTool: vi.fn(),
}));

import { POST } from "@/app/api/chat/actions/route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { executeTool } from "@/lib/ai/tools";

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function request(body: unknown) {
  return new Request("http://localhost/api/chat/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Tracks the idempotency-ledger interactions of the admin client mock. */
const ledger = {
  insert: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
};

function mockLedgerClaim({
  claimError = null,
  existing = null,
}: {
  claimError?: { code?: string; message?: string } | null;
  existing?: { status: string; executed_at: string } | null;
} = {}) {
  // The claim error applies to the FIRST insert only — a reclaim insert
  // after deleting a failed/stale row must be able to succeed.
  if (claimError) {
    ledger.insert
      .mockResolvedValueOnce({ data: null, error: claimError })
      .mockResolvedValue({ data: null, error: null });
  } else {
    ledger.insert.mockResolvedValue({ data: null, error: null });
  }
  ledger.delete.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  });
  ledger.update.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  });
  ledger.select.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      }),
    }),
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table !== "chat_action_executions") throw new Error(`unexpected table ${table}`);
      return {
        insert: ledger.insert,
        delete: ledger.delete,
        select: ledger.select,
        update: ledger.update,
      };
    }),
  } as never);
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
  mockLedgerClaim();
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
        action_id: "msg-1-add_task-0",
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
    expect(ledger.insert).toHaveBeenCalledWith({
      family_id: FAMILY_ID,
      action_id: "msg-1-add_task-0",
      tool_name: "add_task",
      status: "running",
    });
    expect(ledger.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
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
        action_id: "msg-1-add_task-0",
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken" },
      }),
    );

    expect(response.status).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("rejects a proposal without a stable action_id", async () => {
    const response = await POST(
      request({
        family_id: FAMILY_ID,
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken" },
      }),
    );

    expect(response.status).toBe(400);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("does not execute a write twice when the same action_id is retried after completion", async () => {
    mockLedgerClaim({
      claimError: { code: "23505", message: "duplicate key value" },
      existing: { status: "completed", executed_at: new Date().toISOString() },
    });

    const response = await POST(
      request({
        family_id: FAMILY_ID,
        action_id: "msg-1-add_task-0",
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.duplicate).toBe(true);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("reports an in-progress claim instead of pretending success", async () => {
    mockLedgerClaim({
      claimError: { code: "23505", message: "duplicate key value" },
      existing: { status: "running", executed_at: new Date().toISOString() },
    });

    const response = await POST(
      request({
        family_id: FAMILY_ID,
        action_id: "msg-1-add_task-0",
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken" },
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("CHAT_ACTION_IN_PROGRESS");
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("reclaims a stale running claim from a crashed request", async () => {
    mockLedgerClaim({
      claimError: { code: "23505", message: "duplicate key value" },
      existing: {
        status: "running",
        executed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    });
    vi.mocked(executeTool).mockResolvedValue(
      JSON.stringify({ success: true, task_id: "task-1" }),
    );

    const response = await POST(
      request({
        family_id: FAMILY_ID,
        action_id: "msg-1-add_task-0",
        tool_name: "add_task",
        args: { title: "Anmeldung abschicken" },
      }),
    );

    expect(response.status).toBe(200);
    expect(ledger.delete).toHaveBeenCalled();
    expect(executeTool).toHaveBeenCalled();
  });

  it("marks the claim as failed when execution fails so a retry can run", async () => {
    vi.mocked(executeTool).mockResolvedValue(
      JSON.stringify({ error: "Aufgabe nicht gefunden." }),
    );

    const response = await POST(
      request({
        family_id: FAMILY_ID,
        action_id: "msg-1-update_task-0",
        tool_name: "update_task",
        args: { task_id: "task-1", status: "open" },
      }),
    );

    expect(response.status).toBe(422);
    expect(ledger.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(ledger.delete).not.toHaveBeenCalled();
  });
});
