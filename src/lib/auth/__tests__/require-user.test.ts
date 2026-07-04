import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server supabase client before importing requireUser.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the user when authenticated", async () => {
    const mockUser = { id: "user-1", email: "a@b.de" };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    });

    const result = await requireUser();
    expect(result.user).toEqual(mockUser);
    expect(result.status).toBeNull();
  });

  it("returns a 401 structured error when unauthenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const result = await requireUser();
    expect(result.user).toBeNull();
    expect(result.status).toBe(401);
    expect(result.json).toEqual({
      error: "Nicht authentifiziert. Bitte erneut anmelden.",
      code: "UNAUTHENTICATED",
    });
  });
});
