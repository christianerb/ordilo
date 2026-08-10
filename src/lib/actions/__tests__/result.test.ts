import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/resolve-user-family", () => ({
  resolveUserFamily: vi.fn(),
}));

import { FRIENDLY_ERROR, getUserFamily } from "@/lib/actions/result";
import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";

type SupabaseLike = Parameters<typeof getUserFamily>[0];

const supabase = {} as SupabaseLike;

describe("FRIENDLY_ERROR", () => {
  it("is the shared German fallback message", () => {
    expect(FRIENDLY_ERROR).toBe(
      "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    );
  });
});

describe("getUserFamily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the deterministic family resolver", async () => {
    const resolved = {
      data: {
        id: "fam-1",
        name: "Familie Test",
        onboarding_completed_at: null,
      },
      error: null,
    };
    (resolveUserFamily as ReturnType<typeof vi.fn>).mockResolvedValue(resolved);

    const result = await getUserFamily(supabase);

    expect(result).toEqual(resolved);
    expect(resolveUserFamily).toHaveBeenCalledWith(supabase);
  });

  it("preserves a missing-family result", async () => {
    (resolveUserFamily as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await getUserFamily(supabase);
    expect(result).toEqual({ data: null, error: null });
  });

  it("preserves the resolver's friendly query error", async () => {
    (resolveUserFamily as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: FRIENDLY_ERROR,
    });

    const result = await getUserFamily(supabase);
    expect(result).toEqual({ data: null, error: FRIENDLY_ERROR });
  });
});
