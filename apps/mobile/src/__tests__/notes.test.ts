import { apiFetch } from "../lib/api";
import {
  buildCredentialsContent,
  buildDocumentUpdatePayload,
  createNote,
  getNoteContent,
  isShortNoteValue,
  shouldShowNoteSummary,
  maxNoteContentLength,
  triggerNoteAnalysis,
  updateDocumentSecret,
  updateConfirmedDocument,
} from "../lib/notes";
import type { ReviewAnalysis } from "../lib/document-review";

jest.mock("expo-file-system", () => ({
  File: class MockNoteFile extends Blob {
    constructor(uri: string) {
      super([uri], { type: "image/jpeg" });
    }
  },
}));

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
      "- **URL:** https://netflix.example\n" +
        "- **Benutzername:** familie@example.de\n\n" +
        "Familienkonto",
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
        attachment: {
          mimeType: "image/jpeg",
          name: "router.jpg",
          uri: "file:///cache/router.jpg",
        },
      }),
    ).resolves.toMatchObject({ document_id: "note-1", status: "confirmed" });

    const [, options] = mockApiFetch.mock.calls[0];
    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/notes", expect.objectContaining({
      method: "POST",
    }));
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("uses only the supported protected PATCH fields for a confirmed note", async () => {
    mockApiFetch.mockResolvedValue({} as Response);
    const payload = buildDocumentUpdatePayload(note, {
      title: " WLAN zuhause ",
      summary: "  Router im Flur  ",
      document_type: "credentials",
    });

    await updateConfirmedDocument("note-1", payload);

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

  it("uses the same protected PATCH contract to rename a confirmed document", async () => {
    mockApiFetch.mockResolvedValue({} as Response);
    const payload = buildDocumentUpdatePayload(note, {
      title: " Neuer Dokumenttitel ",
      summary: note.summary,
      document_type: note.document_type,
    });

    await updateConfirmedDocument("document-1", payload);

    expect(payload.title).toBe("Neuer Dokumenttitel");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/document-1", {
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

describe("note reader helpers", () => {
  it("treats a single short line as a value", () => {
    expect(isShortNoteValue("2281")).toBe(true);
    expect(isShortNoteValue("  DE12 3456 7890  ")).toBe(true);
    expect(isShortNoteValue("Zeile eins\nZeile zwei")).toBe(false);
    expect(isShortNoteValue("x".repeat(41))).toBe(false);
    expect(isShortNoteValue("   ")).toBe(false);
  });

  it("hides a summary that only repeats the note", () => {
    expect(shouldShowNoteSummary("2281", "2281")).toBe(false);
    expect(shouldShowNoteSummary("2281", null)).toBe(false);
    const long = "Der Zählerstand wird jedes Jahr im Januar an die Stadtwerke gemeldet.";
    expect(shouldShowNoteSummary(long, `${long}`)).toBe(false);
    expect(shouldShowNoteSummary(long, "an die Stadtwerke gemeldet.")).toBe(false);
    expect(shouldShowNoteSummary(long, "Jährliche Meldung an die Stadtwerke.")).toBe(true);
  });
});
