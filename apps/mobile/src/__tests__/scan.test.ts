import { ApiError, apiFetch } from "../lib/api";
import * as FileSystem from "expo-file-system/legacy";
import {
  continueScannedDocumentPipeline,
  getScanMimeType,
  MAX_SCAN_FILE_SIZE,
  persistScanQueue,
  reconcileScanQueue,
  resumeScannedDocument,
  stageScannedDocument,
  uploadScannedDocument,
  validateScannedDocument,
  waitForScannedDocumentAnalysis,
} from "../lib/scan";

jest.mock("../lib/api", () => ({
  ...jest.requireActual("../lib/api"),
  apiFetch: jest.fn(),
  getApiUrl: () => "https://ordilo.test",
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
    return { from: jest.fn(() => query), auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: "test-token" } } })) } };
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  uploadAsync: jest.fn(),
  FileSystemSessionType: { BACKGROUND: 0 },
  FileSystemUploadType: { MULTIPART: 1 },
  getInfoAsync: jest.fn(),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn(),
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
  it.each([0, 503, 401, 403])("preserves status-query failure %s for retry classification", async (status) => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "unavailable" }, status });
    await expect(resumeScannedDocument("document-1")).rejects.toMatchObject({ status: status || 503 });
  });

  it("classifies thrown network failures as retryable", async () => {
    mockMaybeSingle.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(resumeScannedDocument("document-1")).rejects.toMatchObject({ status: 0 });
  });

  it("does not retry a missing or inaccessible document indefinitely", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null, status: 200 });
    await expect(resumeScannedDocument("document-1")).rejects.toMatchObject({ status: 404 });
  });
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

    await expect(
      stageScannedDocument({
        id: "large-scan",
        uri: "file:///picked.pdf",
        name: "rechnung.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow("Die Datei ist zu groß. Maximum: 4 MB.");

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

  it.each([400, 413, 503])("preserves HTTP %s for durable-worker retry decisions", async (status) => {
    jest.mocked(FileSystem.uploadAsync).mockResolvedValue({ status, headers: {}, mimeType: "application/json", body: "{}" });
    await expect(uploadScannedDocument({ id: "scan-1", uri: "file:///scan.pdf", name: "scan.pdf", mimeType: "application/pdf" }, "family-1")).rejects.toMatchObject({ status });
  });

  it("treats an unconfirmed successful response as retryable", async () => {
    jest.mocked(FileSystem.uploadAsync).mockResolvedValue({ status: 200, headers: {}, mimeType: "text/html", body: "not-json" });
    await expect(uploadScannedDocument({ id: "scan-1", uri: "file:///scan.pdf", name: "scan.pdf", mimeType: "application/pdf" }, "family-1")).rejects.toMatchObject({ status: 503 });
  });

  it("uses an authenticated native background multipart transfer with a stable retry key", async () => {
    jest.mocked(FileSystem.uploadAsync).mockResolvedValue({
      status: 200, headers: {}, mimeType: "application/json",
      body: JSON.stringify({
        document_id: "document-1",
        server_pipeline: true,
        status: "uploaded",
      }),
    });

    await uploadScannedDocument(
      {
        id: "scan-1",
        uri: "file:///documents/ordilo-scan/scan-1.jpg",
        name: "scan-1.jpg",
        mimeType: "image/jpeg",
      },
      "family-1",
    );

    expect(FileSystem.uploadAsync).toHaveBeenCalledWith("https://ordilo.test/api/documents/upload", "file:///documents/ordilo-scan/scan-1.jpg", expect.objectContaining({
      sessionType: 0, uploadType: 1, fieldName: "file", mimeType: "image/jpeg",
      parameters: { family_id: "family-1", upload_key: "scan-1" },
      headers: { Authorization: "Bearer test-token" },
    }));
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

  it("follows persisted server progress until analysis is ready", async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { status: "uploaded" }, error: null })
      .mockResolvedValueOnce({ data: { status: "ocr_done" }, error: null })
      .mockResolvedValueOnce({ data: { status: "analyzed" }, error: null });
    const statuses: string[] = [];

    await expect(
      waitForScannedDocumentAnalysis(
        "document-1",
        (status) => {
          statuses.push(status);
        },
        0,
      ),
    ).resolves.toBe("analyzed");

    expect(statuses).toEqual(["uploaded", "ocr_done", "analyzed"]);
  });

  it("reports persisted progress only when the status changes", async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { status: "uploaded" }, error: null })
      .mockResolvedValueOnce({ data: { status: "uploaded" }, error: null })
      .mockResolvedValueOnce({ data: { status: "analyzed" }, error: null });
    const statuses: string[] = [];

    await waitForScannedDocumentAnalysis(
      "document-1",
      (status) => {
        statuses.push(status);
      },
      0,
    );

    expect(statuses).toEqual(["uploaded", "analyzed"]);
  });

  it("cancels status polling when the scan screen is dismissed", async () => {
    const controller = new AbortController();
    mockMaybeSingle.mockResolvedValue({
      data: { status: "uploaded" },
      error: null,
    });

    await expect(
      waitForScannedDocumentAnalysis(
        "document-1",
        () => controller.abort(),
        1_000,
        200,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it("stops following a document when its persisted pipeline fails", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { status: "failed" },
      error: null,
    });

    await expect(
      waitForScannedDocumentAnalysis("document-1", undefined, 0),
    ).rejects.toThrow("Das Dokument konnte nicht verarbeitet werden.");
  });

  it("serializes queue checkpoints so a later snapshot cannot be overwritten", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    jest
      .mocked(FileSystem.writeAsStringAsync)
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce(undefined);

    const first = persistScanQueue([]);
    const second = persistScanQueue([
      {
        id: "scan-1",
        uri: "file:///documents/scan-1.pdf",
        name: "scan-1.pdf",
        mimeType: "application/pdf",
        serverPipeline: true,
        state: "queued",
      },
    ]);

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
    expect(FileSystem.writeAsStringAsync).toHaveBeenLastCalledWith(
      "file:///documents/ordilo-scan/queue.json",
      expect.stringContaining('"serverPipeline":true'),
    );
  });
});

it("restarts failed server analysis rather than polling a terminal state", async () => {
  mockMaybeSingle.mockResolvedValue({ data: { status: "failed", failure_stage: "analyze" }, error: null });
  mockApiFetch.mockResolvedValue({} as Response);
  await resumeScannedDocument("document-1");
  expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/document-1/analyze", { method: "POST" });
  expect(mockApiFetch).not.toHaveBeenCalledWith("/api/documents/document-1/ocr", expect.anything());
});
it("does not restart processing or completed documents", async () => {
  for (const status of ["ocr_processing", "analyzing", "analyzed", "confirmed"]) {
    mockMaybeSingle.mockResolvedValue({ data: { status }, error: null });
    await resumeScannedDocument("document-1");
  }
  expect(mockApiFetch).not.toHaveBeenCalled();
});
it("keeps an unseen share arrival when another screen removes a completed import", async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 123 } as never);
  const arrival = { id: "new-share", uri: "file:///documents/ordilo-scan/family-1/new.pdf", name: "new.pdf", mimeType: "application/pdf", state: "queued" };
  jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify([arrival]));
  expect(await reconcileScanQueue([], "family-1", ["completed-import"])).toEqual([arrival]);
  expect(FileSystem.writeAsStringAsync).toHaveBeenLastCalledWith("file:///documents/ordilo-scan/family-1/queue.json", JSON.stringify([arrival]));
});
