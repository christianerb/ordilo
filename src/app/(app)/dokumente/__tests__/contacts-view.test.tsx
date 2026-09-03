import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteContact = vi.fn();

vi.mock("@/app/(app)/dokumente/actions", () => ({
  createContact: vi.fn(),
  deleteContact: (...args: unknown[]) => deleteContact(...args),
  updateContact: vi.fn(),
}));

import { ContactsView } from "@/app/(app)/dokumente/contacts-view";
import type { ContactRow } from "@/app/(app)/dokumente/actions";

const CONTACT = {
  id: "contact-1",
  family_id: "family-1",
  source_document_id: "document-1",
  source_key: "praxis",
  name: "Praxis Dr. Sommer",
  organization: "Hausarztpraxis",
  role: "Kinderärztin",
  phone: "+49 30 123456",
  email: null,
  status: "confirmed",
  user_edited_at: null,
  created_by: null,
  created_at: "2026-09-03T12:00:00.000Z",
  updated_at: "2026-09-03T12:00:00.000Z",
} satisfies ContactRow;

describe("ContactsView deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteContact.mockResolvedValue({
      success: true,
      data: { id: CONTACT.id },
    });
  });

  it("names the contact, warns about re-analysis, and removes it after confirmation", async () => {
    render(
      <ContactsView
        initialContacts={[CONTACT]}
        onOpenSource={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Praxis Dr. Sommer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kontakt löschen" }));

    expect(screen.getByText("Kontakt löschen?")).toBeDefined();
    expect(
      screen.getByText(/nicht wieder angelegt/),
    ).toHaveTextContent("Praxis Dr. Sommer");

    fireEvent.click(
      screen.getByRole("button", { name: "Kontakt löschen" }),
    );

    await waitFor(() => {
      expect(deleteContact).toHaveBeenCalledWith(CONTACT.id);
      expect(
        screen.queryByRole("button", { name: /Praxis Dr. Sommer/ }),
      ).toBeNull();
    });
  });
});
