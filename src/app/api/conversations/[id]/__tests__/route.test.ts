import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/ai/chat-history", () => ({
  deleteConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
}));

import { DELETE, PATCH } from "@/app/api/conversations/[id]/route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  deleteConversation,
  updateConversationTitle,
} from "@/lib/ai/chat-history";

const CONVERSATION_ID = "550e8400-e29b-41d4-a716-446655440000";

/** Placeholder server client — the chat-history functions are mocked. */
const serverClient = { marker: "server" };

function params(id: string = CONVERSATION_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body?: unknown, method = "POST") {
  return new Request(`http://localhost/api/conversations/${CONVERSATION_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/conversations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      serverClient,
    );
  });

  it("PATCH returns 400 when the title is missing", async () => {
    const response = await PATCH(request({}), params());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Titel erforderlich.",
      code: "INVALID_INPUT",
    });
  });

  it("PATCH returns 400 for a blank title", async () => {
    const response = await PATCH(request({ title: "   " }), params());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Titel erforderlich.",
      code: "INVALID_INPUT",
    });
  });

  it("PATCH renames the conversation with the trimmed title", async () => {
    (updateConversationTitle as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    const response = await PATCH(
      request({ title: "  Neuer Titel  " }),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(updateConversationTitle).toHaveBeenCalledWith(
      serverClient,
      CONVERSATION_ID,
      "Neuer Titel",
    );
  });

  it("DELETE removes the conversation", async () => {
    (deleteConversation as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    const response = await DELETE(request(undefined, "DELETE"), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(deleteConversation).toHaveBeenCalledWith(
      serverClient,
      CONVERSATION_ID,
    );
  });

  it("DELETE returns 500 with code when deletion fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (deleteConversation as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db down"),
    );

    const response = await DELETE(request(undefined, "DELETE"), params());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Konversation konnte nicht gelöscht werden.",
      code: "DELETE_FAILED",
    });
  });
});
