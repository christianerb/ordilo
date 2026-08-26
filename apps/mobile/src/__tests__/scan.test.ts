import { ApiError, apiFetch } from "../lib/api";
import * as FileSystem from "expo-file-system/legacy";
import {
  continueScannedDocumentPipeline,
  getScanMimeType,
  MAX_SCAN_FILE_SIZE,
  persistScanQueue,
  stageScannedDocument,
  uploadScannedDocument,
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

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: jest.fn(),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-file-system", () => ({
  File: class MockNativeFile extends Blob {
    uri: string;

    constructor(uri: string) {
      super(["scan"], { type: "image/jpeg" });
      this.uri = uri;
    }
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

  it("removes a staged file when its actual size exceeds the upload limit", async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      size: MAX_SCAN_FILE_SIZE + 1,
    } as never);

    await expect(stageScannedDocument({
      id: "large-scan",
      uri: "file:///picked.pdf",
      name: "rechnung.pdf",
      mimeType: "application/pdf",
    })).rejects.toThrow("Die Datei ist zu groß. Maximum: 4 MB.");

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///documents/ordilo-scan/large-scan-rechnung.pdf",
      { idempotent: true },
    );
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

  it("sends the staged file as a real multipart Blob", async () => {
    mockApiFetch.mockResolvedValue({
      json: async () => ({
        document_id: "document-1",
        server_pipeline: true,
        status: "uploaded",
      }),
    } as Response);

    await uploadScannedDocument(
      {
        id: "scan-1",
        uri: "file:///documents/ordilo-scan/scan-1.jpg",
        name: "scan-1.jpg",
        mimeType: "image/jpeg",
      },
      "family-1",
    );

    const [, options] = mockApiFetch.mock.calls[0];
    expect(options?.body).toBeInstanceOf(FormData);
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

  it("serializes queue checkpoints so a later snapshot cannot be overwritten", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    jest.mocked(FileSystem.writeAsStringAsync)
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce(undefined);

    const first = persistScanQueue([]);
    const second = persistScanQueue([{
      id: "scan-1",
      uri: "file:///documents/scan-1.pdf",
      name: "scan-1.pdf",
      mimeType: "application/pdf",
      state: "queued",
    }]);

    await Promise.resolve();
    await Promise.resolve();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(2);
    expect(FileSystem.writeAsStringAsync).toHaveBeenLastCalledWith(
      "file:///documents/ordilo-scan/queue.json",
      expect.stringContaining('"id":"scan-1"'),
    );
  });
});
