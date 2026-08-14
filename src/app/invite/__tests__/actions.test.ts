import { beforeEach, describe, expect, it, vi } from "vitest";

const { headerValues, cookieDelete, cookieSet, signInWithOtp, rpc } =
  vi.hoisted(() => ({
    // Mutable so each test can shape the incoming request headers.
    headerValues: new Map<string, string>(),
    cookieDelete: vi.fn(),
    cookieSet: vi.fn(),
    signInWithOtp: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: cookieDelete,
    getAll: vi.fn(() => []),
    set: cookieSet,
  })),
  headers: vi.fn(async () => {
    const values = new Headers();
    for (const [name, value] of headerValues) values.set(name, value);
    return values;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOtp },
    rpc,
  })),
}));

import {
  acceptInvite,
  getInviteMergePreparation,
  mergeOwnedFamilyIntoInvite,
  requestInviteSignIn,
} from "../actions";
import { INVITE_COOKIE } from "@/lib/invite";

const TOKEN = "0123456789abcdef";

describe("requestInviteSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    signInWithOtp.mockResolvedValue({ error: null });
    // Default request: hostile host headers (host-header injection attempt),
    // trustworthy browser Origin header.
    headerValues.clear();
    headerValues.set("host", "evil.example");
    headerValues.set("x-forwarded-host", "evil.example");
    headerValues.set("origin", "https://app.ordilo.de");
  });

  it("builds the auth callback from APP_BASE_URL, ignoring host and origin headers", async () => {
    vi.stubEnv("APP_BASE_URL", "https://ordilo.example");

    const result = await requestInviteSignIn(" Familie@Example.com ", TOKEN);

    expect(result).toEqual({ success: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
      options: {
        emailRedirectTo: "https://ordilo.example/auth/callback",
      },
    });
  });

  it("keeps the invite across the same-site auth callback", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.ordilo.de");

    const result = await requestInviteSignIn(" Familie@Example.com ", TOKEN);

    expect(result).toEqual({ success: true });
    expect(cookieSet).toHaveBeenCalledWith(
      INVITE_COOKIE,
      TOKEN,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      }),
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
      options: {
        emailRedirectTo: "https://app.ordilo.de/auth/callback",
      },
    });
  });

  it("falls back to the request Origin header when no base URL is configured", async () => {
    const result = await requestInviteSignIn("familie@example.com", TOKEN);

    expect(result).toEqual({ success: true });
    // Spoofed host/x-forwarded-host headers must not leak into the link.
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
      options: {
        emailRedirectTo: "https://app.ordilo.de/auth/callback",
      },
    });
  });

  it("marks the invite cookie insecure for a plain-http origin", async () => {
    headerValues.set("origin", "http://localhost:3000");

    const result = await requestInviteSignIn("familie@example.com", TOKEN);

    expect(result).toEqual({ success: true });
    expect(cookieSet).toHaveBeenCalledWith(
      INVITE_COOKIE,
      TOKEN,
      expect.objectContaining({ secure: false }),
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback",
      },
    });
  });

  it("fails without sending an email when no base URL can be determined", async () => {
    headerValues.delete("origin");

    const result = await requestInviteSignIn("familie@example.com", TOKEN);

    expect(result).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("removes the invite cookie when sending fails", async () => {
    signInWithOtp.mockResolvedValue({ error: new Error("send failed") });

    const result = await requestInviteSignIn("familie@example.com", TOKEN);

    expect(result.success).toBe(false);
    expect(cookieDelete).toHaveBeenCalledWith(INVITE_COOKIE);
  });

  it("rejects an invalid invite before sending an email", async () => {
    const result = await requestInviteSignIn("familie@example.com", "invalid");

    expect(result).toEqual({
      success: false,
      error: "Die Einladung ist ungültig.",
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("acceptInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins the family for a valid token", async () => {
    rpc.mockResolvedValue({ data: { status: "joined" }, error: null });

    const result = await acceptInvite(TOKEN);

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("accept_family_invite", {
      p_token: TOKEN,
    });
  });

  it("rejects a malformed token before calling the RPC", async () => {
    const result = await acceptInvite("invalid");

    expect(result).toEqual({
      success: false,
      reason: "invalid",
      error: "Die Einladung ist ungültig.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports an expired or unknown invite", async () => {
    rpc.mockResolvedValue({ data: { status: "invalid" }, error: null });

    const result = await acceptInvite(TOKEN);

    expect(result).toEqual({
      success: false,
      reason: "invalid",
      error: "Diese Einladung ist nicht mehr gültig.",
    });
  });

  it("reports when the user already belongs to another family", async () => {
    rpc.mockResolvedValue({
      data: { status: "already_in_family" },
      error: null,
    });

    const result = await acceptInvite(TOKEN);

    expect(result).toEqual({
      success: false,
      reason: "already_in_family",
      error: "Du bist schon in einer Familie.",
    });
  });

  it("directs an owner to the merge flow", async () => {
    rpc.mockResolvedValue({
      data: { status: "merge_required" },
      error: null,
    });

    const result = await acceptInvite(TOKEN);

    expect(result).toEqual({
      success: false,
      reason: "merge_required",
      error: "Deine Familie muss zuerst zusammengeführt werden.",
    });
  });

  it("asks for a reload when the session has expired", async () => {
    rpc.mockResolvedValue({ data: { status: "unauthenticated" }, error: null });

    const result = await acceptInvite(TOKEN);

    expect(result).toEqual({
      success: false,
      error: "Deine Anmeldung ist abgelaufen. Bitte lade die Seite neu.",
    });
  });

  it("returns a friendly error when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("rpc failed") });

    const result = await acceptInvite(TOKEN);

    expect(result).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
  });
});

describe("getInviteMergePreparation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a direct join when the owned family is empty", async () => {
    rpc.mockResolvedValue({
      data: {
        status: "merge_available", source_family_name: "Familie Schmidt",
        document_count: 0, task_count: 0, calendar_event_count: 0,
        member_count: 0, collection_count: 0, inventory_item_count: 0,
        target_adult_count: 2, fingerprint: "preview-123",
      },
      error: null,
    });

    await expect(getInviteMergePreparation(TOKEN)).resolves.toMatchObject({
      success: true, state: "empty_source",
      preview: { sourceFamilyName: "Familie Schmidt", fingerprint: "preview-123" },
    });
  });
});

describe("mergeOwnedFamilyIntoInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges an owned family with a valid invite", async () => {
    rpc.mockResolvedValue({ data: { status: "merged" }, error: null });

    await expect(mergeOwnedFamilyIntoInvite(TOKEN, "preview-123")).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("merge_owned_family_into_invite", {
      p_token: TOKEN,
      p_preview_fingerprint: "preview-123",
    });
  });

  it("shows a specific error when the source family has other members", async () => {
    rpc.mockResolvedValue({
      data: { status: "shared_source_family" },
      error: null,
    });

    await expect(mergeOwnedFamilyIntoInvite(TOKEN, "preview-123")).resolves.toEqual({
      success: false,
      reason: "shared_source_family",
      error:
        "Deine bisherige Familie wird schon von mehreren Konten genutzt und kann nicht automatisch zusammengeführt werden.",
    });
  });

  it("refreshes the review when contents changed since the preview", async () => {
    rpc.mockResolvedValue({
      data: { status: "preview_changed" },
      error: null,
    });

    await expect(mergeOwnedFamilyIntoInvite(TOKEN, "preview-123")).resolves.toEqual({
      success: false,
      reason: "preview_changed",
      error:
        "Deine Inhalte haben sich gerade geändert. Wir zeigen dir die aktuelle Übersicht.",
    });
  });
});
