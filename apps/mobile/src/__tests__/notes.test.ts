import { apiFetch } from "../lib/api";
import {
  buildCredentialsContent,
  buildNoteUpdatePayload,
  createNote,
  getNoteContent,
  maxNoteContentLength,
  triggerNoteAnalysis,
  updateDocumentSecret,
  updateConfirmedNote,
} from "../lib/notes";
import type { ReviewAnalysis } from "../lib/document-review";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = jest.mocked(apiFetch);

const note: ReviewAnalysis = {
  status: "confirmed",
  created_at: "2026-07-04T12:00:00.000Z",
  confirmed_at: "2026-07-04T12:00:00.000Z",
  original_filename: null,
  mime_type: null,
  page_count: 1,
  ocr_text: "Der Router steht im Flur.",
  credential_text: "Familienwissen",
  document_type: "note",
  title: "WLAN",
  summary: "Router im Flur",
  family_members: [],
  organizations: [],
  contacts: [],
  dates: [],
  amounts: [],
  tasks: [],
  facts: [],
  suggested_category: "Sonstiges",
  tags: [],
  needs_user_review: false,
};

describe("native notes helpers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps the password out of credential note content", () => {
    expect(
      buildCredentialsContent({
        title: "Netflix",
        url: "https://netflix.example",
        username: "familie@example.de",
        description: "Familienkonto",
      }),
    ).toBe(
      "# Netflix\n\n- **URL:** https://netflix.example\n\n- **Benutzername:** familie@example.de\n\nFamilienkonto",
    );
  });

  it("makes credential content length measurable before submitting it", () => {
    expect(
      buildCredentialsContent({
        title: "WLAN",
        url: "https://familie.example",
        username: "familie@example.de",
        description: "x".repeat(maxNoteContentLength),
      }).length,
    ).toBeGreaterThan(maxNoteContentLength);
  });

  it("always renders a note body from OCR text, never credential metadata", () => {
    expect(getNoteContent(note)).toBe("Der Router steht im Flur.");
    expect(getNoteContent({ ocr_text: null, credential_text: "Öffentliche Login-URL" }))
      .toBe("Diese Notiz hat keinen Text.");
  });

  it("posts the native multipart note contract", async () => {
    mockApiFetch.mockResolvedValue({
      json: async () => ({
        document_id: "note-1",
        status: "confirmed",
        server_pipeline: true,
      }),
    } as Response);

    await expect(
      createNote({
        title: "  WLAN  ",
        content: "  Router im Flur  ",
        documentType: "note",
        familyId: "family-1",
        secret: "nicht-im-text",
      }),
    ).resolves.toMatchObject({ document_id: "note-1", status: "confirmed" });

    const [, options] = mockApiFetch.mock.calls[0];
    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/notes", expect.objectContaining({
      method: "POST",
    }));
    expect(options?.body).toBeInstanceOf(FormData);
  });

  it("uses only the supported protected PATCH fields for a confirmed note", async () => {
    mockApiFetch.mockResolvedValue({} as Response);
    const payload = buildNoteUpdatePayload(note, {
      title: " WLAN zuhause ",
      summary: "  Router im Flur  ",
      document_type: "credentials",
    });

    await updateConfirmedNote("note-1", payload);

    expect(payload).toEqual({
      document_type: "credentials",
      title: "WLAN zuhause",
      summary: "Router im Flur",
      family_members: [],
      organizations: [],
      contacts: [],
      dates: [],
      amounts: [],
      suggested_category: "Sonstiges",
      tags: [],
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/note-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("triggers the direct analyze fallback when the server pipeline is unavailable", async () => {
    mockApiFetch.mockResolvedValue({} as Response);

    await triggerNoteAnalysis("note-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/note-1/analyze", {
      method: "POST",
    });
  });

  it("uses the protected route to set, change, or remove a credential secret", async () => {
    mockApiFetch.mockResolvedValue({} as Response);

    await updateDocumentSecret("note-1", "");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/note-1/secret", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "" }),
    });
  });
});
