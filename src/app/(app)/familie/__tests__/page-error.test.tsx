import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// vi.mock factories are hoisted above imports, so any variables they
// reference must be created with vi.hoisted to be available at mock time.
const { mockRedirect, mockRouterRefresh, mockRouterPush } = vi.hoisted(() => ({
  // Next.js redirect() throws internally to stop execution. The mock
  // must also throw so the server component stops after calling redirect.
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  mockRouterRefresh: vi.fn(),
  mockRouterPush: vi.fn(),
}));

// Mock the supabase server client. getMiddlewareFamily returns null so
// the page falls back to its own (mocked) families query — the path these
// tests exercise.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getMiddlewareFamily: vi.fn().mockResolvedValue(null),
}));

// Mock next/navigation redirect — it must NOT be called on query errors.
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

// Mock the server actions so FamilieClient doesn't call real Supabase.
vi.mock("@/app/(app)/familie/actions", () => ({
  addFamilyMember: vi.fn(),
  updateFamilyMember: vi.fn(),
  removeFamilyMember: vi.fn(),
}));

import FamiliePage from "@/app/(app)/familie/page";
import { createClient } from "@/lib/supabase/server";

/**
 * Build a mock supabase server client with configurable query results.
 */
function mockServerClient(options: {
  familyData?: { id: string; name: string } | null;
  familyError?: unknown;
  memberData?: unknown[];
  memberError?: unknown;
}) {
  // resolveUserFamily's owned lookup:
  // families.select().eq("created_by", uid).order().limit(1).maybeSingle()
  const familiesChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.familyData ?? null,
      error: options.familyError ?? null,
    }),
  };

  // Invite-only fallback — these tests exercise the owned path (or no
  // family at all), so this resolves null.
  const membershipsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const membersChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: options.memberData ?? null,
      error: options.memberError ?? null,
    }),
  };

  // Document-count lookup (extracted_entities) — chainable .eq().eq().in(),
  // resolving to an empty result by default (counts aren't under test here).
  const entitiesChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return { select: vi.fn(() => familiesChain) };
    }
    if (table === "family_memberships") {
      return { select: vi.fn(() => membershipsChain) };
    }
    if (table === "family_members") {
      return { select: vi.fn(() => membersChain) };
    }
    if (table === "extracted_entities") {
      return { select: vi.fn(() => entitiesChain) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    auth: {
      // resolveUserFamily resolves the session before querying.
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "test@ordilo.test" } },
      }),
    },
    from: fromMock,
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

describe("FamiliePage (server component) — query error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the error state (NOT onboarding redirect) when the family query fails", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyError: new Error("Connection refused"),
      }),
    );

    const result = await FamiliePage();
    render(result);

    // Should show the error state, not redirect to onboarding.
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Daten konnten nicht geladen werden/),
    ).toBeInTheDocument();
  });

  it("renders the error state when the member query fails (family OK)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: { id: "fam-1", name: "Testfamilie" },
        memberError: new Error("Connection refused"),
      }),
    );

    const result = await FamiliePage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Daten konnten nicht geladen werden/),
    ).toBeInTheDocument();
  });

  it("redirects to onboarding when family is null with NO error (legitimate case)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: null,
        familyError: null,
      }),
    );

    // redirect() throws internally (like real Next.js), so we expect
    // the component to throw rather than render anything.
    await expect(FamiliePage()).rejects.toThrow("NEXT_REDIRECT:/onboarding");

    // This is the legitimate no-family case → redirect to onboarding.
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("renders the normal page with members when both queries succeed", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: { id: "fam-1", name: "Testfamilie" },
        memberData: [
          {
            id: "mem-1",
            family_id: "fam-1",
            name: "Emma",
            role: "Tochter",
            birthdate: null,
            avatar_color: "#E46018",
            created_at: "2026-07-04T10:00:00Z",
          },
        ],
      }),
    );

    const result = await FamiliePage();
    render(result);

    // Normal content should be visible.
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("Testfamilie")).toBeInTheDocument();
    expect(screen.getByText("Emma")).toBeInTheDocument();
    expect(
      screen.queryByText(/Daten konnten nicht geladen werden/),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state (NOT error) when family exists but has zero members", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: { id: "fam-1", name: "Testfamilie" },
        memberData: [],
      }),
    );

    const result = await FamiliePage();
    render(result);

    // Should show the empty state, NOT the error state.
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Noch niemand hier/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Daten konnten nicht geladen werden/),
    ).not.toBeInTheDocument();
  });
});
