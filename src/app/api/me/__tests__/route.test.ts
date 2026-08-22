import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/account/delete-family-account", () => ({
  deleteFamilyAccountData: vi.fn(),
}));

import { DELETE } from "@/app/api/me/route";
import { requireUser } from "@/lib/auth/require-user";
import { deleteFamilyAccountData } from "@/lib/account/delete-family-account";
import type { User } from "@supabase/supabase-js";

const USER = { id: "user-1", email: "test@ordilo.test" } as User;

/** Friendly German error used for unexpected failures. */
const FRIENDLY_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

function authenticated() {
  vi.mocked(requireUser).mockResolvedValue({
    user: USER,
    status: null,
    json: null,
  });
}

function unauthenticated() {
  vi.mocked(requireUser).mockResolvedValue({
    user: null,
    status: 401,
    json: {
      error: "Nicht authentifiziert. Bitte erneut anmelden.",
      code: "UNAUTHENTICATED",
    },
  });
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/me", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("DELETE /api/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request with 401", async () => {
    unauthenticated();

    const response = await DELETE(request({ confirmName: "Familie Müller" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Nicht authentifiziert. Bitte erneut anmelden.",
      code: "UNAUTHENTICATED",
    });
    expect(deleteFamilyAccountData).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    authenticated();

    const response = await DELETE(request("not json {"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Ungültige Anfrage.",
    });
    expect(deleteFamilyAccountData).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-string confirmName with 400", async () => {
    authenticated();

    for (const body of [{}, { confirmName: 42 }, { confirmName: null }]) {
      const response = await DELETE(request(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        success: false,
        error: "Ungültige Anfrage.",
      });
    }
    expect(deleteFamilyAccountData).not.toHaveBeenCalled();
  });

  it("returns 400 when the confirmation name does not match", async () => {
    authenticated();
    vi.mocked(deleteFamilyAccountData).mockResolvedValue({
      success: false,
      error: "Der Name stimmt nicht mit dem Familiennamen überein.",
    });

    const response = await DELETE(request({ confirmName: "Falscher Name" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Der Name stimmt nicht mit dem Familiennamen überein.",
    });
    expect(deleteFamilyAccountData).toHaveBeenCalledWith(USER, "Falscher Name");
  });

  it("deletes the account on a valid confirmation", async () => {
    authenticated();
    vi.mocked(deleteFamilyAccountData).mockResolvedValue({
      success: true,
      data: null,
    });

    const response = await DELETE(request({ confirmName: "Familie Müller" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: null });
    expect(deleteFamilyAccountData).toHaveBeenCalledWith(
      USER,
      "Familie Müller",
    );
  });

  it("returns 500 with the friendly German error on unexpected failures", async () => {
    authenticated();
    vi.mocked(deleteFamilyAccountData).mockRejectedValue(new Error("boom"));

    const response = await DELETE(request({ confirmName: "Familie Müller" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: FRIENDLY_ERROR,
    });
  });
});
