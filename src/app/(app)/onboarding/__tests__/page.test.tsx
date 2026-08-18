import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// vi.mock factories are hoisted above imports, so any variables they
// reference must be created with vi.hoisted to be available at mock time.
const { mockRedirect } = vi.hoisted(() => ({
  // Next.js redirect() throws internally to stop execution. The mock
  // must also throw so the server component stops after calling redirect.
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

// Mock the supabase server client.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock next/navigation redirect and useRouter.
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock the OnboardingFlow client component to keep the test focused on
// the server component's routing/error logic.
vi.mock("@/app/(app)/onboarding/onboarding-flow", () => ({
  OnboardingFlow: vi.fn(({ initialState }) => (
    <div data-testid="onboarding-flow" data-step={initialState.step}>
      Onboarding flow at step: {initialState.step}
    </div>
  )),
}));

import OnboardingPage from "@/app/(app)/onboarding/page";
import { createClient } from "@/lib/supabase/server";

/**
 * Build a mock supabase server client with configurable query results.
 */
function mockServerClient(options: {
  familyData?: {
    id: string;
    name: string;
    onboarding_completed_at: string | null;
  } | null;
  familyError?: unknown;
  /** "owned" = the user created it, "joined" = they accepted an invite. */
  ownership?: "owned" | "joined";
  memberData?: unknown[];
  memberError?: unknown;
}) {
  const ownership = options.ownership ?? "owned";
  const owned = ownership === "owned" ? (options.familyData ?? null) : null;
  const joined = ownership === "joined" ? (options.familyData ?? null) : null;

  // resolveUserFamily: owned family first, then the oldest membership.
  const familiesChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: owned,
      error: options.familyError ?? null,
    }),
  };

  const membershipsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: joined ? { families: joined } : null,
      error: null,
    }),
  };

  const membersChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: options.memberData ?? null,
      error: options.memberError ?? null,
    }),
  };
  const aliasesChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
    if (table === "family_email_aliases") {
      return { select: vi.fn(() => aliasesChain) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: fromMock,
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

describe("OnboardingPage (server component) — onboarding_completed_at + error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Error handling: query failures should surface a German error state,
  // NOT silently route the user into the onboarding flow.
  // -------------------------------------------------------------------------

  it("renders a German error state when the family query fails (NOT the onboarding flow)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyError: new Error("Connection refused"),
      }),
    );

    const result = await OnboardingPage();
    render(result);

    // Should NOT redirect to /home.
    expect(mockRedirect).not.toHaveBeenCalled();
    // Should show a German error message.
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
  });

  it("renders a German error state when the member query fails (family OK, completed_at NULL)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: {
          id: "fam-1",
          name: "Testfamilie",
          onboarding_completed_at: null,
        },
        memberError: new Error("Connection refused"),
      }),
    );

    const result = await OnboardingPage();
    render(result);

    // Should NOT redirect to /home.
    expect(mockRedirect).not.toHaveBeenCalled();
    // Should show a German error message, NOT the onboarding flow.
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-flow")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Completed onboarding → redirect to /home (uses onboarding_completed_at,
  // NOT member count).
  // -------------------------------------------------------------------------

  it("redirects to /home when onboarding_completed_at is set (even with zero members)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: {
          id: "fam-1",
          name: "Testfamilie",
          onboarding_completed_at: "2026-07-06T10:00:00Z",
        },
      }),
    );

    // redirect() throws internally (like real Next.js).
    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT:/home");
    expect(mockRedirect).toHaveBeenCalledWith("/home");
  });

  // -------------------------------------------------------------------------
  // Mid-onboarding: family exists, completed_at NULL → render onboarding flow
  // -------------------------------------------------------------------------

  it("renders onboarding flow at add-member step when family exists, completed_at NULL, no members", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: {
          id: "fam-1",
          name: "Testfamilie",
          onboarding_completed_at: null,
        },
        memberData: [],
      }),
    );

    const result = await OnboardingPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-flow")).toHaveAttribute(
      "data-step",
      "add-member",
    );
  });

  it("renders onboarding flow at choose-next step when family exists, completed_at NULL, has members", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: {
          id: "fam-1",
          name: "Testfamilie",
          onboarding_completed_at: null,
        },
        memberData: [
          {
            id: "mem-1",
            family_id: "fam-1",
            name: "Emma",
            role: null,
            birthdate: null,
            avatar_color: null,
            created_at: "2026-07-04T10:00:00Z",
          },
        ],
      }),
    );

    const result = await OnboardingPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-flow")).toHaveAttribute(
      "data-step",
      "choose-next",
    );
  });

  // -------------------------------------------------------------------------
  // Joined via invite → nothing to onboard, regardless of the marker.
  //
  // Regression: onboarding_completed_at belongs to the family, but the gate
  // read it as if it were the USER's. An invitee whose family creator had
  // not finished her own setup was bounced into HER flow and asked to name
  // a family that already exists — instead of landing in it.
  // -------------------------------------------------------------------------

  it("redirects a joined member to /home even when the creator never finished onboarding", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        ownership: "joined",
        familyData: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: null,
        },
      }),
    );

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT:/home");
    expect(mockRedirect).toHaveBeenCalledWith("/home");
  });

  it("redirects a joined member to /home when the family is fully onboarded", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        ownership: "joined",
        familyData: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: "2026-08-14T10:00:00Z",
        },
      }),
    );

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  // -------------------------------------------------------------------------
  // No family → fresh start at family-name step
  // -------------------------------------------------------------------------

  it("renders onboarding flow at family-name step when no family exists", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: null,
        familyError: null,
      }),
    );

    const result = await OnboardingPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-flow")).toHaveAttribute(
      "data-step",
      "family-name",
    );
  });
});
