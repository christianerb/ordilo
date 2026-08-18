import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DokumenteClient } from "@/app/(app)/dokumente/dokumente-client";
import type { ContactRow } from "@/app/(app)/dokumente/actions";
import type { ScanContextValue } from "@/lib/scan/scan-context-types";

const scanContext = {
  documents: [],
  loadingDocs: false,
  seedDocuments: vi.fn(),
  openDocument: vi.fn(),
  closeDocument: vi.fn(),
  handleDeleteDocument: vi.fn(),
  openCreateNote: vi.fn(),
  openWizard: vi.fn(),
  dropZoneRef: { current: null },
  handleDragEnter: vi.fn(),
  handleDragOver: vi.fn(),
  handleDragLeave: vi.fn(),
  handleDrop: vi.fn(),
} as unknown as ScanContextValue;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=kontakte"),
}));

vi.mock("@/lib/scan/scan-context", () => ({
  useScan: () => scanContext,
}));

const CONTACT: ContactRow = {
  id: "contact-1",
  family_id: "family-1",
  source_document_id: null,
  source_key: null,
  name: "Anna Becker",
  organization: "Muster GmbH",
  role: "Hausverwaltung",
  phone: "+49 30 123456",
  email: "anna@example.com",
  status: "confirmed",
  user_edited_at: null,
  created_by: "user-1",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
};

describe("Dokumente contacts flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("opens a blank new-contact form after dismissing an edit form", () => {
    render(
      <DokumenteClient
        initialDocuments={[]}
        initialContacts={[CONTACT]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Anna Becker.*Muster GmbH/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Kontakt bearbeiten" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Kontakt bearbeiten" }),
    ).toBeDefined();
    expect(screen.getByLabelText("Name")).toHaveValue("Anna Becker");

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Neu erstellen" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Neuer Kontakt" }),
    ).toBeDefined();
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
