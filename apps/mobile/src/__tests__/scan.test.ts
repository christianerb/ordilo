import { apiFetch } from "../lib/api";
import {
  getScanMimeType,
  MAX_SCAN_FILE_SIZE,
  triggerScannedDocumentOcr,
  validateScannedDocument,
} from "../lib/scan";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = jest.mocked(apiFetch);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("native scan helpers", () => {
  it("falls back to an accepted MIME type from a picked filename", () => {
    expect(getScanMimeType(null, "brief.PDF")).toBe("application/pdf");
    expect(getScanMimeType(null, "rechnung.jpeg")).toBe("image/jpeg");
  });

  it("rejects unsupported files and files larger than the shared limit", () => {
    expect(
      validateScannedDocument({ mimeType: "text/plain", size: 200 }),
    ).toBe("Bitte wähle ein Bild oder eine PDF-Datei aus.");
    expect(
      validateScannedDocument({
        mimeType: "application/pdf",
        size: MAX_SCAN_FILE_SIZE + 1,
      }),
    ).toBe("Die Datei ist zu groß. Maximum: 4 MB.");
  });

  it("uses the authenticated OCR endpoint when no server pipeline runs", async () => {
    mockApiFetch.mockResolvedValue({} as Response);

    await triggerScannedDocumentOcr("document-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/document-1/ocr", {
      method: "POST",
    });
  });
});
