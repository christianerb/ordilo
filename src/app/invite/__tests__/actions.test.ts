import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieDelete, cookieSet, signInWithOtp } = vi.hoisted(() => ({
  cookieDelete: vi.fn(),
  cookieSet: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: cookieDelete,
    getAll: vi.fn(() => []),
    set: cookieSet,
  })),
  headers: vi.fn(async () => {
    const values = new Headers();
    values.set("host", "app.ordilo.de");
    values.set("x-forwarded-host", "app.ordilo.de");
    values.set("x-forwarded-proto", "https");
    return values;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOtp },
  })),
}));

import { requestInviteSignIn } from "../actions";
import { INVITE_COOKIE } from "@/lib/invite";

const TOKEN = "0123456789abcdef";

describe("requestInviteSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it("keeps the invite across the same-site auth callback", async () => {
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
