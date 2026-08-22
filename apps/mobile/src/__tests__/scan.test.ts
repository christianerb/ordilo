import {
  getScanMimeType,
  MAX_SCAN_FILE_SIZE,
  validateScannedDocument,
} from "../lib/scan";

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
});
