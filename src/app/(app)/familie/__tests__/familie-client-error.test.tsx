import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation useRouter so FamilieClient can call router.refresh().
const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

// Mock the server actions so FamilieClient doesn't call real Supabase.
vi.mock("@/app/(app)/familie/actions", () => ({
  addFamilyMember: vi.fn(),
  updateFamilyMember: vi.fn(),
  removeFamilyMember: vi.fn(),
}));

import { FamilieClient } from "@/app/(app)/familie/familie-client";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "mem-1",
    family_id: "fam-1",
    name: "Emma",
    role: "Tochter",
    birthdate: null,
    avatar_color: "#E46018",
    created_at: "2026-07-04T10:00:00Z",
    ...overrides,
  };
}

describe("FamilieClient — fetch error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a distinct German error state when fetchError is true", () => {
    render(
      <FamilieClient
        familyName="Testfamilie"
        members={[]}
        fetchError={true}
      />,
    );

    // The error heading should be visible and in German.
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();

    // The error should have a German description.
    expect(
      screen.getByText(/Es ist ein Fehler aufgetreten/),
    ).toBeInTheDocument();

    // A retry button should be present.
    expect(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    ).toBeInTheDocument();
  });

  it("does NOT render the empty state or member list when fetchError is true", () => {
    render(
      <FamilieClient
        familyName="Testfamilie"
        members={[]}
        fetchError={true}
      />,
    );

    // The empty state heading should NOT be shown.
    expect(
      screen.queryByText("Noch keine Familienmitglieder"),
    ).not.toBeInTheDocument();

    // The "Person hinzufügen" add button should NOT be shown in error state.
    // (The only button should be the retry button.)
    const addButtons = screen.queryAllByRole("button", {
      name: "Person hinzufügen",
    });
    expect(addButtons).toHaveLength(0);
  });

  it("does NOT render the error state when fetchError is false/absent", () => {
    render(
      <FamilieClient familyName="Testfamilie" members={[makeMember()]} />,
    );

    // The error heading should NOT be present.
    expect(
      screen.queryByText("Daten konnten nicht geladen werden"),
    ).not.toBeInTheDocument();

    // Normal content should be visible.
    expect(screen.getByText("Testfamilie")).toBeInTheDocument();
    expect(screen.getByText("Emma")).toBeInTheDocument();
  });

  it("calls router.refresh() when the retry button is clicked", () => {
    render(
      <FamilieClient
        familyName="Testfamilie"
        members={[]}
        fetchError={true}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "Erneut versuchen" });
    fireEvent.click(retryButton);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("error state is distinct from the empty (zero-member) state", () => {
    const { rerender } = render(
      <FamilieClient
        familyName="Testfamilie"
        members={[]}
        fetchError={true}
      />,
    );

    // Error state: shows error heading, NOT empty state heading.
    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
    // The empty state heading is an <h3> — check it's absent.
    expect(
      screen.queryByRole("heading", { name: "Noch keine Familienmitglieder" }),
    ).not.toBeInTheDocument();

    // Now re-render without fetchError (legitimate empty state).
    rerender(
      <FamilieClient familyName="Testfamilie" members={[]} />,
    );

    // Empty state: shows empty state heading, NOT error heading.
    expect(
      screen.getByRole("heading", { name: "Noch keine Familienmitglieder" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Daten konnten nicht geladen werden"),
    ).not.toBeInTheDocument();
  });
});
