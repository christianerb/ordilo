import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/account/export-family-data", () => ({
  exportFamilyData: vi.fn(),
}));

import { GET } from "@/app/api/me/export/route";
import { exportFamilyData } from "@/lib/account/export-family-data";
import { requireUser } from "@/lib/auth/require-user";

const USER = {
  id: "user-1",
  email: "familie@example.test",
} as User;

describe("GET /api/me/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authenticated user", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: null,
      status: 401,
      json: {
        error: "Nicht authentifiziert. Bitte erneut anmelden.",
        code: "UNAUTHENTICATED",
      },
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(exportFamilyData).not.toHaveBeenCalled();
  });

  it("returns the caller's export as a non-cacheable JSON attachment", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: USER,
      status: null,
      json: null,
    });
    vi.mocked(exportFamilyData).mockResolvedValue({
      format: "ordilo-data-export",
      formatVersion: 1,
      exportedAt: "2026-09-08T10:00:00.000Z",
      account: {
        id: USER.id,
        email: USER.email ?? null,
        createdAt: "2026-08-01T10:00:00.000Z",
        lastSignInAt: null,
      },
      family: null,
      contents: {},
      files: { included: false, note: "Keine Originaldateien." },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="ordilo-daten-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      format: "ordilo-data-export",
      account: { id: USER.id },
      files: { included: false },
    });
    expect(exportFamilyData).toHaveBeenCalledWith(USER);
  });

  it("does not return partial data when export assembly fails", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: USER,
      status: null,
      json: null,
    });
    vi.mocked(exportFamilyData).mockRejectedValue(new Error("database"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
  });
});
