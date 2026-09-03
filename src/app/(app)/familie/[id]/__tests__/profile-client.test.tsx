import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({
    openDocument: vi.fn(),
  }),
}));
const mockTaskEq = vi.fn();
const mockTaskUpdate = vi.fn(() => ({ eq: mockTaskEq }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn(() => ({
      update: mockTaskUpdate,
    })),
  }),
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
    relations_backfilled_at: null,
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
  it("links to the edit page instead of opening a sheet", () => {
    render(
      <ProfileClient
        member={makeMember({ id: "mem-1", name: "Emma", role: "Kind" })}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
      />,
    );

    const editLink = screen.getByTestId("profile-edit-button");
    expect(editLink).toHaveAttribute("href", "/familie/mem-1/bearbeiten");
  });
});

describe("ProfileClient — Aufgaben", () => {
  it("marks an open profile task done and updates the open count", async () => {
    mockTaskEq.mockResolvedValueOnce({ error: null });
    const task: ProfileTask = {
      id: "task-1",
      title: "Sportsachen einpacken",
      due_date: "2026-07-10",
      status: "open",
      document_id: null,
    };

    render(
      <ProfileClient
        member={makeMember()}
        documents={[]}
        tasks={[task]}
        dateEntities={emptyDateEntities}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Aufgabe als erledigt markieren" }),
    );

    expect(screen.queryByText("Sportsachen einpacken")).not.toBeInTheDocument();
    expect(screen.queryByText("· 1 offen")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockTaskUpdate).toHaveBeenCalledWith({ status: "done" });
      expect(mockTaskEq).toHaveBeenCalledWith("id", "task-1");
    });
  });
});

describe("ProfileClient — Beziehungen (mehrere Rollen gleichzeitig)", () => {
  it("spells out every relationship in its own line", () => {
    render(
      <ProfileClient
        member={makeMember({ role: "Mutter" })}
        documents={[]}
        tasks={[]}
        dateEntities={emptyDateEntities}
        relations={[
          { role: "Mutter", member_ids: ["mem-2", "mem-3"] },
          { role: "Partnerin", member_ids: ["mem-4"] },
        ]}
        otherMembers={[
          { id: "mem-2", name: "Hanna" },
          { id: "mem-3", name: "Ben" },
          { id: "mem-4", name: "Chris" },
        ]}
      />,
    );
    expect(screen.getByTestId("profile-relationship").textContent).toBe(
      "Mutter von Hanna und Ben · Partnerin von Chris",
    );
  });

  it("does not repeat the role next to the birthdate", () => {
    render(
      <ProfileClient
        member={makeMember({ role: "Elternteil", birthdate: "1985-06-15" })}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
        relations={[{ role: "Elternteil", member_ids: ["mem-2"] }]}
        otherMembers={[{ id: "mem-2", name: "Hanna" }]}
      />,
    );
    // The birthdate line stays compact — the role leads the relationship line.
    expect(screen.getByText("15.06.1985")).toBeInTheDocument();
    expect(screen.getByTestId("profile-relationship")).toHaveTextContent(
      "Elternteil von Hanna",
    );
  });

  it("falls back to the plain role when there is nobody to point at", () => {
    render(
      <ProfileClient
        member={makeMember({ role: "Oma", birthdate: "1950-02-01" })}
        documents={[]}
        tasks={emptyTasks}
        dateEntities={emptyDateEntities}
        relations={[{ role: "Oma", member_ids: [] }]}
      />,
    );
    expect(screen.getByTestId("profile-relationship")).toHaveTextContent("Oma");
    expect(screen.getByText("01.02.1950")).toBeInTheDocument();
  });

  it("shows no relationship line when the member has none", () => {
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
