import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

// Mock next/navigation useRouter so ProfileClient can call router.push.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({
    openDocument: vi.fn(),
  }),
}));

const mockUpdateFamilyMember = vi.fn();
vi.mock("@/app/(app)/familie/actions", () => ({
  updateFamilyMember: (...args: unknown[]) => mockUpdateFamilyMember(...args),
}));

import { ProfileClient } from "@/app/(app)/familie/[id]/profile-client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";
import type {
  ProfileDocument,
  ProfileTask,
  ProfileDateEntity,
} from "@/lib/profile-utils";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "mem-1",
    family_id: "fam-1",
    name: "Emma",
    role: "Kind",
    birthdate: null,
    avatar_color: "#E46018",
    created_at: "2026-06-01T00:00:00Z",
    linked_user_id: null,
    photo_url: null,
    related_member_ids: [],
    relationship_label: null,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<ProfileDocument> = {}): ProfileDocument {
  return {
    id: "doc-1",
    title: "Stromrechnung Juli",
    document_type: "invoice",
    status: "confirmed",
    created_at: "2026-07-01T10:00:00Z",
    confirmed_at: "2026-07-02T12:00:00Z",
    original_filename: "invoice.pdf",
    ...overrides,
  };
}

const emptyTasks: ProfileTask[] = [];
const emptyDateEntities: ProfileDateEntity[] = [];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe("ProfileClient — Dokumente section (VAL-PROFILE-002)", () => {
  it("renders the German document type label for each linked document", () => {
    const documents = [
      makeDocument({ id: "doc-1", title: "Stromrechnung", document_type: "invoice" }),
      makeDocument({ id: "doc-2", title: "Kita-Brief", document_type: "school" }),
    ];

    render(
      <ProfileClient
        member={makeMember()}
        documents={documents}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    const documentsSection = screen.getByTestId("profile-documents");
    expect(within(documentsSection).getByText(DOCUMENT_TYPE_LABELS.invoice)).toBeDefined();
    expect(within(documentsSection).getByText(DOCUMENT_TYPE_LABELS.school)).toBeDefined();
  });

  it("renders the document type alongside the document title", () => {
    const documents = [
      makeDocument({ id: "doc-1", title: "Krankenhaus-Bericht", document_type: "medical" }),
    ];

    render(
      <ProfileClient
        member={makeMember()}
        documents={documents}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    const documentsSection = screen.getByTestId("profile-documents");
    expect(within(documentsSection).getByText("Krankenhaus-Bericht")).toBeDefined();
    expect(within(documentsSection).getByText(DOCUMENT_TYPE_LABELS.medical)).toBeDefined();
  });

  it("renders a type badge element for each document with a known type", () => {
    const documents = [
      makeDocument({ id: "doc-1", document_type: "invoice" }),
      makeDocument({ id: "doc-2", document_type: "letter" }),
    ];

    render(
      <ProfileClient
        member={makeMember()}
        documents={documents}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    const documentsSection = screen.getByTestId("profile-documents");
    const badges = within(documentsSection).getAllByTestId("document-type-badge");
    expect(badges).toHaveLength(2);
  });

  it("does not render a type badge for documents with a null document_type", () => {
    const documents = [
      makeDocument({ id: "doc-1", title: "Ohne Typ", document_type: null }),
    ];

    render(
      <ProfileClient
        member={makeMember()}
        documents={documents}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    const documentsSection = screen.getByTestId("profile-documents");
    expect(within(documentsSection).queryByTestId("document-type-badge")).toBeNull();
    // The title is still rendered.
    expect(within(documentsSection).getByText("Ohne Typ")).toBeDefined();
  });

  it("shows the empty state when no documents are linked", () => {
    render(
      <ProfileClient
        member={makeMember()}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    const documentsSection = screen.getByTestId("profile-documents");
    expect(within(documentsSection).getByText(/Noch keine Dokumente/)).toBeDefined();
  });
});

describe("ProfileClient — Bearbeiten", () => {
  it("opens an edit sheet pre-filled with the member's data", () => {
    render(
      <ProfileClient
        member={makeMember({ name: "Emma", role: "Kind" })}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    fireEvent.click(screen.getByTestId("profile-edit-button"));

    expect(screen.getByRole("heading", { name: "Bearbeiten" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Emma");
  });

  it("saves changes via updateFamilyMember and reflects them in the header", async () => {
    mockUpdateFamilyMember.mockResolvedValue({
      success: true,
      data: makeMember({ name: "Emma Neu", role: "Kind" }),
    });

    render(
      <ProfileClient
        member={makeMember({ id: "mem-1", name: "Emma", role: "Kind" })}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    fireEvent.click(screen.getByTestId("profile-edit-button"));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Emma Neu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mockUpdateFamilyMember).toHaveBeenCalledWith(
        "mem-1",
        expect.objectContaining({ name: "Emma Neu" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Emma Neu" })).toBeInTheDocument();
    });
  });
});

describe("ProfileClient — Beziehungen (multiple related members)", () => {
  it("lists every related member's name, joined, in its own line", () => {
    render(
      <ProfileClient
        member={makeMember({
          role: "Elternteil",
          relationship_label: "Elternteil",
          related_member_ids: ["mem-2", "mem-3"],
        })}
        documents={[]}
        tasks={[]}
        dateEntities={emptyDateEntities}
        relatedMemberNames={["Hanna", "Ben"]}
        otherMembers={[
          { id: "mem-2", name: "Hanna" },
          { id: "mem-3", name: "Ben" },
        ]}
      />,
    );
    expect(screen.getByTestId("profile-relationship").textContent).toBe(
      "Elternteil von Hanna, Ben",
    );
  });

  it("does not crowd the role/birthdate line with the relationship detail", () => {
    render(
      <ProfileClient
        member={makeMember({
          role: "Elternteil",
          birthdate: "1985-06-15",
          relationship_label: "Elternteil",
          related_member_ids: ["mem-2"],
        })}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
        relatedMemberNames={["Hanna"]}
      />,
    );
    // Role + birthdate stay compact on their own line …
    expect(screen.getByText("Elternteil · 15.06.1985")).toBeInTheDocument();
    // … the relationship detail renders separately, not appended to it.
    expect(screen.queryByText(/Elternteil · 15\.06\.1985 ·/)).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-relationship")).toHaveTextContent(
      "Elternteil von Hanna",
    );
  });

  it("shows no relationship line when the member has no related members", () => {
    render(
      <ProfileClient
        member={makeMember()}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );
    expect(screen.queryByTestId("profile-relationship")).not.toBeInTheDocument();
  });
});
