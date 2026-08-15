import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("../actions", () => ({
  acceptInvite: vi.fn(),
  getInviteMergePreparation: vi.fn(),
  mergeOwnedFamilyIntoInvite: vi.fn(),
  requestInviteSignIn: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({ auth: { verifyOtp: vi.fn() } })),
}));

import InvitePage from "../[token]/page";
import { createClient } from "@/lib/supabase/server";

const TOKEN = "0123456789abcdef";

type RpcResult = { data: unknown; error: unknown };

function mockServerClient(options: {
  user: { id: string } | null;
  info?: RpcResult;
  preview?: RpcResult;
}) {
  const rpc = vi.fn((name: string) => {
    if (name === "get_family_invite_info") {
      return Promise.resolve(
        options.info ?? {
          data: { status: "valid", family_name: "Familie Erb" },
          error: null,
        },
      );
    }
    return Promise.resolve(options.preview ?? { data: null, error: null });
  });

  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: options.user } }) },
    rpc,
    // The page only uses auth.getUser and rpc.
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return rpc;
}

async function renderPage() {
  render(await InvitePage({ params: Promise.resolve({ token: TOKEN }) }));
}

describe("InvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Regression: the merge flow replaced `state={user ? "confirm" : "valid"}`
  // with a preview-only chain, so a signed-out invitee — the normal case for
  // a link shared over WhatsApp — landed on the "Familie beitreten?" button
  // instead of the sign-in form, and no click could ever accept the invite.
  it("shows the email sign-in form to a signed-out visitor", async () => {
    const rpc = mockServerClient({ user: null });

    await renderPage();

    expect(screen.getByTestId("invite-valid")).toBeInTheDocument();
    expect(screen.getByTestId("invite-email-input")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-confirm")).not.toBeInTheDocument();
    // No merge preview is fetched for a visitor without an account.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_family_invite_info", { p_token: TOKEN });
  });

  it("asks a signed-in visitor without an own family to confirm", async () => {
    mockServerClient({
      user: { id: "user-1" },
      preview: { data: { status: "joinable" }, error: null },
    });

    await renderPage();

    expect(screen.getByTestId("invite-confirm")).toBeInTheDocument();
  });

  it("offers the merge review when the preview reports transferable content", async () => {
    mockServerClient({
      user: { id: "user-1" },
      preview: {
        data: {
          status: "merge_available",
          source_family_name: "Familie Schmidt",
          document_count: 4,
          task_count: 0,
          calendar_event_count: 0,
          member_count: 0,
          collection_count: 0,
          target_adult_count: 2,
          fingerprint: "preview-123",
        },
        error: null,
      },
    });

    await renderPage();

    expect(screen.getByTestId("invite-merge")).toBeInTheDocument();
    expect(screen.getByText(/4 Dokumente/)).toBeInTheDocument();
  });

  // A raising preview RPC used to be swallowed silently, leaving a confirm
  // screen that could only ever answer with an error.
  it("falls back to the confirmation screen and logs when the preview raises", async () => {
    mockServerClient({
      user: { id: "user-1" },
      preview: { data: null, error: new Error("42P01") },
    });

    await renderPage();

    expect(screen.getByTestId("invite-confirm")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(
      "[invite] merge preview RPC failed:",
      expect.any(Error),
    );
  });

  it("shows the invalid screen for an unknown token", async () => {
    mockServerClient({
      user: null,
      info: { data: { status: "invalid" }, error: null },
    });

    await renderPage();

    expect(screen.getByTestId("invite-invalid")).toBeInTheDocument();
  });
});
