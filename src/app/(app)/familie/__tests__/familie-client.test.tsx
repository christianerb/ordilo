import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
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

describe("FamilieClient — member list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders member rows with name and role", () => {
    render(<FamilieClient familyName="Testfamilie" members={[makeMember()]} />);
    expect(screen.getByText("Emma")).toBeInTheDocument();
    expect(screen.getByText(/Tochter/)).toBeInTheDocument();
  });

  it("shows the document count in the meta line", () => {
    render(
      <FamilieClient
        familyName="Testfamilie"
        members={[makeMember()]}
        documentCounts={{ "mem-1": 5 }}
      />,
    );
    expect(screen.getByText(/5 Dokumente/)).toBeInTheDocument();
  });

  it("uses singular '1 Dokument' for a single document", () => {
    render(
      <FamilieClient
        familyName="Testfamilie"
        members={[makeMember()]}
        documentCounts={{ "mem-1": 1 }}
      />,
    );
    expect(screen.getByText(/1 Dokument/)).toBeInTheDocument();
  });

  it("does not show a document count when a member has 0 linked documents", () => {
    render(
      <FamilieClient familyName="Testfamilie" members={[makeMember()]} />,
    );
    expect(screen.queryByText(/Dokumente/)).not.toBeInTheDocument();
  });

  it("renders the family name in the banner", () => {
    render(<FamilieClient familyName="Testfamilie" members={[]} />);
    expect(
      screen.getByRole("heading", { name: "Testfamilie" }),
    ).toBeInTheDocument();
  });

  it("shows a time-of-day greeting", () => {
    render(<FamilieClient familyName="Testfamilie" members={[]} />);
    expect(screen.getByText(/Guten (Morgen|Tag|Abend)|Gute Nacht/)).toBeInTheDocument();
  });

  it("shows the add member button", () => {
    render(<FamilieClient familyName="Testfamilie" members={[]} />);
    expect(
      screen.getByTestId("add-member-button"),
    ).toBeInTheDocument();
  });

  it("does not render a settings link", () => {
    render(<FamilieClient familyName="Testfamilie" members={[]} />);
    expect(
      screen.queryByRole("link", { name: "Einstellungen" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the family name heading in the error state", () => {
    render(
      <FamilieClient familyName="Testfamilie" members={[]} fetchError={true} />,
    );
    expect(
      screen.queryByRole("heading", { name: "Testfamilie" }),
    ).not.toBeInTheDocument();
  });

  it("navigates to the member's profile when the row is clicked", () => {
    render(<FamilieClient familyName="Testfamilie" members={[makeMember()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Emma öffnen" }));
    expect(mockPush).toHaveBeenCalledWith("/familie/mem-1");
  });

  it("does not navigate when the row actions menu is clicked", () => {
    render(<FamilieClient familyName="Testfamilie" members={[makeMember()]} />);
    fireEvent.click(screen.getByTestId("person-card-actions"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the relationship label alongside the related member's name", () => {
    const anna = makeMember({ id: "mem-1", name: "Anna", role: "Mutter" });
    const ben = makeMember({
      id: "mem-2",
      name: "Ben",
      role: "Vater",
      related_member_id: "mem-1",
      relationship_label: "Ehepartner",
    });
    render(<FamilieClient familyName="Testfamilie" members={[anna, ben]} />);
    expect(screen.getByText(/Ehepartner von Anna/)).toBeInTheDocument();
  });
});
