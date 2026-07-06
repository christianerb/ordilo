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

// Mock the supabase server client.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
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
  const familiesChain = {
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.familyData ?? null,
      error: options.familyError ?? null,
    }),
  };

  const membersChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: options.memberData ?? null,
      error: options.memberError ?? null,
    }),
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "families") {
      return { select: vi.fn(() => familiesChain) };
    }
    if (table === "family_members") {
      return { select: vi.fn(() => membersChain) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
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
      screen.getByText("Daten konnten nicht geladen werden"),
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

    // Should show the error state, not the empty state or member list.
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
    // Should NOT show the empty state heading.
    expect(
      screen.queryByText("Noch keine Familienmitglieder"),
    ).not.toBeInTheDocument();
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
    // Error state should NOT be shown.
    expect(
      screen.queryByText("Daten konnten nicht geladen werden"),
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
    // The empty state heading is an <h3> — use role query to be specific.
    expect(
      screen.getByRole("heading", { name: "Noch keine Familienmitglieder" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Daten konnten nicht geladen werden"),
    ).not.toBeInTheDocument();
  });
});
