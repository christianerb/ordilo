import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

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
    linked_user_id: null,
    photo_url: null,
    related_member_id: null,
    relationship_label: null,
    ...overrides,
  };
}

describe("FamilieClient — fetch error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a distinct German error state when fetchError is true", () => {
    render(
      <FamilieClient familyName="Testfamilie" members={[]} fetchError={true} />,
    );
    expect(
      screen.getByText("Daten konnten nicht geladen werden."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    ).toBeInTheDocument();
  });

  it("does NOT render the empty state or add button when fetchError is true", () => {
    render(
      <FamilieClient familyName="Testfamilie" members={[]} fetchError={true} />,
    );
    expect(
      screen.queryByText(/Noch niemand hier/),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-member-button")).not.toBeInTheDocument();
  });

  it("does NOT render the error state when fetchError is false", () => {
    render(<FamilieClient familyName="Testfamilie" members={[makeMember()]} />);
    expect(
      screen.queryByText("Daten konnten nicht geladen werden"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Emma")).toBeInTheDocument();
  });

  it("calls router.refresh() when the retry button is clicked", () => {
    render(
      <FamilieClient familyName="Testfamilie" members={[]} fetchError={true} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("error state is distinct from the empty (zero-member) state", () => {
    const { rerender } = render(
      <FamilieClient familyName="Testfamilie" members={[]} fetchError={true} />,
    );
    expect(
      screen.getByText("Daten konnten nicht geladen werden."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Noch niemand hier/),
    ).not.toBeInTheDocument();

    rerender(<FamilieClient familyName="Testfamilie" members={[]} />);
    expect(
      screen.getByText(/Noch niemand hier/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Daten konnten nicht geladen werden"),
    ).not.toBeInTheDocument();
  });
});
