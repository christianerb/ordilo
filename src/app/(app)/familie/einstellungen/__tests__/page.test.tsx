import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockRedirect, mockResolveUserFamily } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  mockResolveUserFamily: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/resolve-user-family", () => ({
  resolveUserFamily: mockResolveUserFamily,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/familie/actions", () => ({
  updateFamilyName: vi.fn(),
}));

import FamilySettingsPage from "@/app/(app)/familie/einstellungen/page";
import { createClient } from "@/lib/supabase/server";

/** The page only uses the server client for the member-count query. */
function mockServerClient(memberCount: number | null) {
  const membersChain = {
    eq: vi.fn().mockResolvedValue({ count: memberCount, error: null }),
  };
  const fromMock = vi.fn((table: string) => {
    if (table === "family_members") {
      return { select: vi.fn(() => membersChain) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  return { from: fromMock } as unknown as Awaited<
    ReturnType<typeof createClient>
  >;
}

describe("FamilySettingsPage (server component)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(null),
    );
  });

  it("renders the error state when the family query fails", async () => {
    mockResolveUserFamily.mockResolvedValue({
      data: null,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });

    const result = await FamilySettingsPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
  });

  it("redirects to onboarding when there is no family", async () => {
    mockResolveUserFamily.mockResolvedValue({ data: null, error: null });

    await expect(FamilySettingsPage()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("renders the family name and member count on success", async () => {
    mockResolveUserFamily.mockResolvedValue({
      data: {
        id: "fam-1",
        name: "Testfamilie",
        created_at: "2026-01-15T10:00:00Z",
        onboarding_completed_at: "2026-01-15T10:00:00Z",
      },
      error: null,
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(3),
    );

    const result = await FamilySettingsPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Testfamilie")).toBeInTheDocument();
    expect(screen.getByText("3 Personen")).toBeInTheDocument();
  });
});
