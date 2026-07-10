import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  recordUsage,
  DAILY_MESSAGE_LIMIT,
} from "@/lib/ai/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Client = Awaited<ReturnType<typeof createClient>>;

function mockClient(selectData: { message_count?: number; id?: string; token_count?: number } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: selectData,
    error: null,
  });
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const updateEq = vi.fn().mockReturnThis();
  // Make the update chain thenable so `await` works on the final .eq()
  (updateEq as unknown as { then: (resolve: (v: unknown) => void) => Promise<unknown> }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  const updateChain = {
    eq: updateEq,
  };
  const insertChain = vi.fn().mockResolvedValue({ data: null, error: null });

  const client = {
    from: vi.fn((table: string) => {
      if (table === "chat_usage") {
        return {
          select: vi.fn(() => selectChain),
          update: vi.fn(() => updateChain),
          insert: insertChain,
        };
      }
      return {};
    }),
  };

  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);
  return { client: client as unknown as Client, maybeSingle, insertChain, updateChain };
}

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows when no usage record exists (new day)", async () => {
    const { client } = mockClient(null);
    const result = await checkRateLimit(client, "fam-1");
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(DAILY_MESSAGE_LIMIT);
  });

  it("allows when under the daily limit", async () => {
    const { client } = mockClient({ message_count: 10 });
    const result = await checkRateLimit(client, "fam-1");
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(10);
    expect(result.remaining).toBe(DAILY_MESSAGE_LIMIT - 10);
  });

  it("denies when at the daily limit", async () => {
    const { client } = mockClient({ message_count: DAILY_MESSAGE_LIMIT });
    const result = await checkRateLimit(client, "fam-1");
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(DAILY_MESSAGE_LIMIT);
    expect(result.remaining).toBe(0);
  });

  it("denies when over the daily limit", async () => {
    const { client } = mockClient({ message_count: DAILY_MESSAGE_LIMIT + 5 });
    const result = await checkRateLimit(client, "fam-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// recordUsage
// ---------------------------------------------------------------------------

describe("recordUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new usage row when none exists", async () => {
    const { client, insertChain } = mockClient(null);
    await recordUsage(client, "fam-1", 500);
    expect(insertChain).toHaveBeenCalledWith(
      expect.objectContaining({
        family_id: "fam-1",
        message_count: 1,
        token_count: 500,
      }),
    );
  });

  it("increments existing usage row", async () => {
    const { client, insertChain } = mockClient({
      id: "usage-1",
      message_count: 10,
      token_count: 2000,
    });
    await recordUsage(client, "fam-1", 500);
    // Should NOT have inserted (existing row was updated instead).
    expect(insertChain).not.toHaveBeenCalled();
  });
});
