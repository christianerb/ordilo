import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/billing/revenuecat", () => ({
  syncRevenueCatEntitlement: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/resolve-user-family", () => ({
  resolveUserFamily: vi.fn(),
}));

import { POST } from "@/app/api/billing/sync/route";
import { requireUser } from "@/lib/auth/require-user";
import { syncRevenueCatEntitlement } from "@/lib/billing/revenuecat";
import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";
import { createClient as createServerClient } from "@/lib/supabase/server";

const USER = { id: "user-1", email: "familie@example.test" } as User;
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function request(body?: unknown): Request {
  return new Request("https://app.ordilo.de/api/billing/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockMembershipLookup(result: { data: unknown; error: unknown }) {
  vi.mocked(createServerClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
    }),
  } as never);
}

describe("POST /api/billing/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      user: USER,
      status: null,
      json: null,
    });
    vi.mocked(syncRevenueCatEntitlement).mockResolvedValue({
      active: true,
      familyId: FAMILY_ID,
      status: "active",
    });
  });

  it("requires an authenticated user", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: null,
      status: 401,
      json: { error: "Nicht authentifiziert.", code: "UNAUTHENTICATED" },
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(syncRevenueCatEntitlement).not.toHaveBeenCalled();
  });

  it("syncs the client-supplied family after verifying membership", async () => {
    mockMembershipLookup({ data: { family_id: FAMILY_ID }, error: null });

    const response = await POST(request({ family_id: FAMILY_ID }));

    expect(response.status).toBe(200);
    expect(syncRevenueCatEntitlement).toHaveBeenCalledWith(FAMILY_ID);
    expect(resolveUserFamily).not.toHaveBeenCalled();
  });

  it("rejects a family the user does not belong to", async () => {
    mockMembershipLookup({ data: null, error: null });

    const response = await POST(request({ family_id: FAMILY_ID }));

    expect(response.status).toBe(403);
    expect(syncRevenueCatEntitlement).not.toHaveBeenCalled();
  });

  it("falls back to the deterministic family resolver without a body", async () => {
    vi.mocked(resolveUserFamily).mockResolvedValue({
      data: {
        id: FAMILY_ID,
        name: "Familie",
        onboarding_completed_at: null,
        isOwner: true,
        introSeenAt: null,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(resolveUserFamily).toHaveBeenCalledWith(expect.anything(), USER.id);
    expect(syncRevenueCatEntitlement).toHaveBeenCalledWith(FAMILY_ID);
  });
});
