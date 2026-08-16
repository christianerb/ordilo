import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

const mockUpdateFamilyMember = vi.fn();
const mockRemoveFamilyMember = vi.fn();
vi.mock("@/app/(app)/familie/actions", () => ({
  updateFamilyMember: (...args: unknown[]) => mockUpdateFamilyMember(...args),
  removeFamilyMember: (...args: unknown[]) => mockRemoveFamilyMember(...args),
}));

import { EditMemberClient } from "@/app/(app)/familie/[id]/bearbeiten/edit-member-client";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "mem-1",
    family_id: "fam-1",
    name: "Karina",
    role: "Mutter",
    birthdate: "1989-05-13",
    avatar_color: "#E46018",
    created_at: "2026-07-04T10:00:00Z",
    linked_user_id: null,
    photo_url: null,
    related_member_ids: [],
    relationship_label: null,
    relations_backfilled_at: null,
    ...overrides,
  };
}

const others = [
  { id: "mem-2", name: "Christian", avatar_color: null, photoUrl: null },
  { id: "mem-3", name: "Hanna", avatar_color: null, photoUrl: null },
];

describe("EditMemberClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateFamilyMember.mockResolvedValue({
      success: true,
      data: { ...makeMember(), relations: [] },
    });
  });

  it("shows the member's data and one row per relationship", () => {
    render(
      <EditMemberClient
        member={makeMember()}
        relations={[
          { role: "Partner:in", member_ids: ["mem-2"] },
          { role: "Mutter", member_ids: ["mem-3"] },
        ]}
        photoUrl={null}
        otherMembers={others}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Karina");
    expect(screen.getByLabelText("Geburtsdatum")).toHaveValue("13.05.1989");
    expect(screen.getByTestId("relationship-row-mem-2")).toHaveTextContent("Christian");
    expect(screen.getByTestId("relationship-row-mem-2")).toHaveTextContent("Partner:in");
    expect(screen.getByTestId("relationship-row-mem-3")).toHaveTextContent("Mutter");
  });

  it("saves name, birthdate and relationships, then returns to the profile", async () => {
    render(
      <EditMemberClient
        member={makeMember()}
        relations={[{ role: "Mutter", member_ids: ["mem-3"] }]}
        photoUrl={null}
        otherMembers={others}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Karina B." } });
    fireEvent.click(screen.getByTestId("relationship-add"));
    fireEvent.click(screen.getByTestId("relationship-pick-mem-2"));
    fireEvent.click(screen.getByTestId("role-chip-Partner:in"));
    fireEvent.click(screen.getByTestId("edit-member-save"));

    await waitFor(() => {
      expect(mockUpdateFamilyMember).toHaveBeenCalledWith("mem-1", {
        name: "Karina B.",
        birthdate: "1989-05-13",
        avatar_color: "#E46018",
        relations: [
          { role: "Mutter", member_ids: ["mem-3"] },
          { role: "Partner:in", member_ids: ["mem-2"] },
        ],
      });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/familie/mem-1");
    });
  });

  it("blocks an empty name with a German message and does not save", async () => {
    render(
      <EditMemberClient
        member={makeMember()}
        relations={[]}
        photoUrl={null}
        otherMembers={others}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("edit-member-save"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte einen Namen eingeben",
    );
    expect(mockUpdateFamilyMember).not.toHaveBeenCalled();
  });

  it("surfaces a server error instead of navigating away", async () => {
    mockUpdateFamilyMember.mockResolvedValue({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });

    render(
      <EditMemberClient
        member={makeMember()}
        relations={[]}
        photoUrl={null}
        otherMembers={others}
      />,
    );

    fireEvent.click(screen.getByTestId("edit-member-save"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Etwas ist schiefgelaufen",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("removes the person from the '…' menu, after a confirmation", async () => {
    mockRemoveFamilyMember.mockResolvedValue({ success: true, data: null });

    render(
      <EditMemberClient
        member={makeMember()}
        relations={[]}
        photoUrl={null}
        otherMembers={others}
      />,
    );

    // jsdom has no PointerEvent, so the Radix trigger is opened with the
    // keyboard handler instead of a pointer press.
    fireEvent.keyDown(screen.getByTestId("edit-member-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("edit-member-remove"));
    fireEvent.click(await screen.findByTestId("edit-member-remove-confirm"));

    await waitFor(() => {
      expect(mockRemoveFamilyMember).toHaveBeenCalledWith("mem-1");
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/familie");
    });
  });

  it("leaves the stored relationships alone when they could not be loaded", async () => {
    render(
      <EditMemberClient
        member={makeMember()}
        relations={[]}
        relationsUnavailable
        photoUrl={null}
        otherMembers={others}
      />,
    );

    // No editor at all — an empty list here would mean "delete them all".
    expect(screen.getByTestId("relations-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("relationship-list")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Karina B." } });
    fireEvent.click(screen.getByTestId("edit-member-save"));

    await waitFor(() => {
      expect(mockUpdateFamilyMember).toHaveBeenCalledWith("mem-1", {
        name: "Karina B.",
        birthdate: "1989-05-13",
        avatar_color: "#E46018",
        relations: undefined,
      });
    });
  });

  it("offers a plain role when nobody else is in the family", () => {
    render(
      <EditMemberClient
        member={makeMember()}
        relations={[{ role: "Mutter", member_ids: [] }]}
        photoUrl={null}
        otherMembers={[]}
      />,
    );

    expect(screen.getByTestId("relationship-solo-row")).toHaveTextContent("Mutter");
    expect(screen.queryByTestId("relationship-add")).not.toBeInTheDocument();
  });
});
