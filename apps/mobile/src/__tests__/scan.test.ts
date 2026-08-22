import { ApiError, apiFetch } from "../lib/api";
import {
  continueScannedDocumentPipeline,
  getScanMimeType,
  MAX_SCAN_FILE_SIZE,
  validateScannedDocument,
} from "../lib/scan";

jest.mock("../lib/api", () => ({
  ...jest.requireActual("../lib/api"),
  apiFetch: jest.fn(),
}));

const mockApiFetch = jest.mocked(apiFetch);
const mockMaybeSingle = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: mockMaybeSingle,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    return { from: jest.fn(() => query) };
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({
    data: { status: "ocr_done" },
    error: null,
  });
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

  it("continues from OCR through analysis when no server pipeline runs", async () => {
    mockApiFetch.mockResolvedValue({} as Response);
    const steps: string[] = [];

    await continueScannedDocumentPipeline("document-1", "ocr", (step) => {
      steps.push(step);
    });

    expect(mockApiFetch.mock.calls).toEqual([
      ["/api/documents/document-1/ocr", { method: "POST" }],
      ["/api/documents/document-1/analyze", { method: "POST" }],
    ]);
    expect(steps).toEqual(["ocr", "analysis"]);
  });

  it("resumes an analysis retry without repeating OCR", async () => {
    mockApiFetch.mockResolvedValue({} as Response);

    await continueScannedDocumentPipeline("document-1", "analysis");

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/documents/document-1/analyze",
      { method: "POST" },
    );
  });

  it("continues after a pipeline step was already claimed", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new ApiError("Already processing", 409))
      .mockResolvedValueOnce({} as Response);

    await continueScannedDocumentPipeline("document-1");

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      "/api/documents/document-1/analyze",
      { method: "POST" },
    );
  });

  it("stops at analysis failures so retry can resume there", async () => {
    const steps: string[] = [];
    mockApiFetch
      .mockResolvedValueOnce({} as Response)
      .mockRejectedValueOnce(new ApiError("Offline", 0));

    await expect(
      continueScannedDocumentPipeline("document-1", "ocr", (step) => {
        steps.push(step);
      }),
    ).rejects.toThrow("Offline");

    expect(steps).toEqual(["ocr", "analysis"]);
  });
});
