import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ordilo/review-card", () => ({
  ReviewCard: ({
    onDirtyChange,
    hasOriginalFile,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
    hasOriginalFile?: boolean;
  }) => (
    <>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Änderung machen
      </button>
      <span data-testid="has-original-file">{String(hasOriginalFile)}</span>
    </>
  ),
}));

vi.mock("@/lib/attribution", () => ({
  fetchDocumentAttribution: vi.fn(),
}));

// The credentials panel reads the document body (ocr_text) on demand — it
// is deliberately not part of the list columns the sheet is handed.
const ocrText = vi.fn<() => Promise<{ data: { ocr_text: string } | null }>>();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => ocrText() }),
      }),
    }),
  }),
}));

import { DocumentDetailSheet } from "@/components/ordilo/document-detail-sheet";
import { fetchDocumentAttribution } from "@/lib/attribution";

const document = {
  id: "doc-1",
  title: "Kita-Gutschein",
  original_filename: "scan.jpg",
  mime_type: "image/jpeg",
  status: "analyzed",
  error_message: null,
  failure_stage: null,
  failure_code: null,
  uploaded_by: "user-1",
  created_at: "2026-08-15T09:42:00.000Z",
};

beforeEach(() => {
  vi.mocked(fetchDocumentAttribution).mockResolvedValue({
    name: null,
    isCurrentUser: false,
  });
  ocrText.mockResolvedValue({ data: null });
});

describe("DocumentDetailSheet", () => {
  it("shows the document status in the header", () => {
    render(
      <DocumentDetailSheet
        document={document as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Kita-Gutschein")).toBeDefined();
    expect(screen.getByText("Bereit zum Durchsehen")).toBeDefined();
  });

  it("shows the on-demand reveal control when an encrypted secret exists", () => {
    render(
      <DocumentDetailSheet
        document={{ ...document, secret: "v1:encrypted-envelope" } as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("document-secret-reveal")).toBeDefined();
  });

  it("shows URL and user name from the document body as working controls", async () => {
    ocrText.mockResolvedValue({
      data: {
        ocr_text:
          "- **URL:** https://www.netflix.com\n" +
          "- **Benutzername:** familie@example.de\n\nFamilienaccount",
      },
    });

    render(
      <DocumentDetailSheet
        document={
          { ...document, document_type: "credentials", secret: null } as never
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("credential-link")).toBeDefined();
    });
    const link = screen.getByTestId("credential-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://www.netflix.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("familie@example.de")).toBeDefined();
    // Both values are copyable.
    expect(screen.getAllByTestId("credential-copy")).toHaveLength(2);
  });

  it("shows the panel without rows when the body has no field layout", async () => {
    ocrText.mockResolvedValue({ data: { ocr_text: "Zugangsdaten WLAN" } });

    render(
      <DocumentDetailSheet
        document={
          { ...document, document_type: "credentials", secret: null } as never
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("document-credentials")).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByTestId("credential-link")).toBeNull();
    });
    expect(screen.queryByTestId("credential-copy")).toBeNull();
  });

  it("offers to add a password to a Zugangsdaten document that has none", () => {
    render(
      <DocumentDetailSheet
        document={
          { ...document, document_type: "credentials", secret: null } as never
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("secret-add-button")).toBeDefined();
    expect(screen.queryByTestId("document-secret-reveal")).toBeNull();
  });

  it("does not offer a password on an ordinary document", () => {
    render(
      <DocumentDetailSheet
        document={{ ...document, document_type: "invoice", secret: null } as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("secret-add-button")).toBeNull();
  });

  it("stores a newly entered password and switches to the reveal control", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ has_secret: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DocumentDetailSheet
        document={
          { ...document, document_type: "credentials", secret: null } as never
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("secret-add-button"));
    fireEvent.change(screen.getByTestId("secret-editor-input"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByTestId("secret-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("credential-secret-reveal")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/secret", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "hunter2" }),
    });

    vi.unstubAllGlobals();
  });

  it("keeps the editor open and shows the error when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Passwort konnte nicht gespeichert werden." }),
      }),
    );

    render(
      <DocumentDetailSheet
        document={
          { ...document, document_type: "credentials", secret: null } as never
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("secret-add-button"));
    fireEvent.change(screen.getByTestId("secret-editor-input"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByTestId("secret-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("secret-editor-error").textContent).toBe(
        "Passwort konnte nicht gespeichert werden.",
      );
    });
    expect(screen.getByTestId("secret-editor-input")).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("drops the reveal control when the password is removed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ has_secret: false }),
      }),
    );

    render(
      <DocumentDetailSheet
        document={
          {
            ...document,
            document_type: "credentials",
            secret: "v1:encrypted-envelope",
          } as never
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("secret-change-button"));
    fireEvent.click(screen.getByTestId("secret-editor-save"));

    await waitFor(() => {
      expect(screen.queryByTestId("credential-secret-reveal")).toBeNull();
    });
    expect(screen.getByTestId("secret-add-button")).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("does not offer an original comparison for a text-only note", () => {
    render(
      <DocumentDetailSheet
        document={{ ...document, original_filename: null, mime_type: null, file_url: null } as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("has-original-file")).toHaveTextContent("false");
  });

  it("names the family member who added the document", async () => {
    vi.mocked(fetchDocumentAttribution).mockResolvedValue({
      name: "Christian",
      isCurrentUser: false,
    });

    render(
      <DocumentDetailSheet
        document={document as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("document-attribution")).toHaveTextContent(
        "Von Christian hinzugefügt · 15.08.2026",
      );
    });
  });

  it("falls back to the date when no family member is linked", async () => {
    render(
      <DocumentDetailSheet
        document={document as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("document-attribution")).toHaveTextContent(
        "Hinzugefügt am 15.08.2026",
      );
    });
  });

  it("protects unsaved corrections when the sheet is closed", async () => {
    const onOpenChange = vi.fn();
    render(
      <DocumentDetailSheet
        document={document as never}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Änderung machen" }));
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Änderungen verwerfen?")).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Weiter bearbeiten" }),
    );
    expect(screen.getByTestId("document-detail-sheet")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Verwerfen",
      }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
