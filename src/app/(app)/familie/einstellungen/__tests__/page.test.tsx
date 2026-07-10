import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
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

function mockServerClient(options: {
  familyData?: { id: string; name: string; created_at: string } | null;
  familyError?: unknown;
  memberCount?: number | null;
}) {
  const familiesChain = {
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.familyData ?? null,
      error: options.familyError ?? null,
    }),
  };

  const membersChain = {
    eq: vi.fn().mockResolvedValue({
      count: options.memberCount ?? null,
      error: null,
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

  return { from: fromMock } as unknown as Awaited<
    ReturnType<typeof createClient>
  >;
}

describe("FamilySettingsPage (server component)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the error state when the family query fails", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ familyError: new Error("Connection refused") }),
    );

    const result = await FamilySettingsPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
  });

  it("redirects to onboarding when there is no family", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ familyData: null }),
    );

    await expect(FamilySettingsPage()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("renders the family name and member count on success", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        familyData: {
          id: "fam-1",
          name: "Testfamilie",
          created_at: "2026-01-15T10:00:00Z",
        },
        memberCount: 3,
      }),
    );

    const result = await FamilySettingsPage();
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Testfamilie")).toBeInTheDocument();
    expect(screen.getByText("3 Personen")).toBeInTheDocument();
  });
});
