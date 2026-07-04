import { describe, it, expect, vi } from "vitest";
import { getPostAuthDestination } from "@/lib/auth/routing";

/**
 * Mock a SupabaseClient with just the `.from().select().limit().maybeSingle()`
 * chain used by getPostAuthDestination.
 */
function mockSupabase(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    auth: { getUser: vi.fn() },
  } as unknown as Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
}

describe("getPostAuthDestination", () => {
  it("routes to /onboarding when no families row exists (first-time user)", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    const result = await getPostAuthDestination(supabase);
    expect(result.destination).toBe("/onboarding");
    expect(result.isFirstTime).toBe(true);
  });

  it("routes to /home when a families row exists (returning user)", async () => {
    const supabase = mockSupabase({
      data: { id: "fam-123" },
      error: null,
    });
    const result = await getPostAuthDestination(supabase);
    expect(result.destination).toBe("/home");
    expect(result.isFirstTime).toBe(false);
  });

  it("routes to /onboarding when the families query errors (safe default)", async () => {
    const supabase = mockSupabase({
      data: null,
      error: new Error("RLS denied"),
    });
    const result = await getPostAuthDestination(supabase);
    expect(result.destination).toBe("/onboarding");
    expect(result.isFirstTime).toBe(true);
  });
});
