import { Platform } from "react-native";
import { ApiError, apiFetch } from "../lib/api";
import * as FileSystem from "expo-file-system/legacy";
import {
  continueScannedDocumentPipeline,
  describeScanFailure,
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
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
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
    ).toBe("Die Datei ist zu groß. Maximum: 20 MB.");
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
    ).rejects.toThrow("Die Datei ist zu groß. Maximum: 20 MB.");

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

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const scanDocument = {
    id: "scan-1",
    uri: "file:///documents/ordilo-scan/scan-1.jpg",
    name: "scan-1.jpg",
    mimeType: "image/jpeg",
    size: 9_000_000,
  };
  const directBody = {
    family_id: "family-1",
    upload_key: "scan-1",
    filename: "scan-1.jpg",
    mime_type: "image/jpeg",
    size: 9_000_000,
    client: "mobile_scan",
  };

  function jsonResponse(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as Response;
  }

  function mockDirectUpload(finalize: Response, prepare = jsonResponse(200, { signed_url: "https://storage.test/upload?token=t" })) {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(prepare)
      .mockResolvedValueOnce(finalize);
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.mocked(FileSystem.uploadAsync).mockResolvedValue({ status: 200, headers: {}, mimeType: null, body: "" });
    return fetchMock;
  }

  it("puts the file straight into Storage, then lets the server confirm it", async () => {
    const fetchMock = mockDirectUpload(
      jsonResponse(200, { document_id: "document-1", server_pipeline: true, status: "uploaded" }),
    );

    await expect(uploadScannedDocument(scanDocument, "family-1")).resolves.toEqual({
      document_id: "document-1",
      server_pipeline: true,
      status: "uploaded",
    });

    const headers = {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      "x-ordilo-platform": Platform.OS,
    };
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://ordilo.test/api/documents/upload-url", {
      method: "POST", headers, body: JSON.stringify(directBody),
    });
    expect(FileSystem.uploadAsync).toHaveBeenCalledWith(
      "https://storage.test/upload?token=t",
      scanDocument.uri,
      { httpMethod: "PUT", sessionType: 0, uploadType: 0, headers: { "Content-Type": "image/jpeg" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://ordilo.test/api/documents/upload", {
      method: "POST", headers, body: JSON.stringify(directBody),
    });
  });

  it.each([400, 413, 503])("preserves HTTP %s for durable-worker retry decisions", async (status) => {
    mockDirectUpload(jsonResponse(status, { error: "Nope", code: "X" }));
    await expect(uploadScannedDocument(scanDocument, "family-1")).rejects.toMatchObject({ status, message: "Nope" });
  });

  it("treats an unconfirmed successful response as retryable", async () => {
    mockDirectUpload(jsonResponse(200, "not-json"));
    await expect(uploadScannedDocument(scanDocument, "family-1")).rejects.toMatchObject({ status: 503 });
  });

  it("retries a refused Storage transfer with a fresh URL instead of giving up", async () => {
    const fetchMock = mockDirectUpload(jsonResponse(200, {}));
    jest.mocked(FileSystem.uploadAsync).mockResolvedValue({ status: 400, headers: {}, mimeType: null, body: "" });

    await expect(uploadScannedDocument(scanDocument, "family-1")).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips the transfer when an earlier attempt already stored the file", async () => {
    const fetchMock = mockDirectUpload(
      jsonResponse(200, { document_id: "document-1", server_pipeline: true, status: "uploaded" }),
      jsonResponse(200, { storage_path: "family-1/doc/scan-1.jpg", already_uploaded: true }),
    );

    await expect(uploadScannedDocument(scanDocument, "family-1")).resolves.toMatchObject({ document_id: "document-1" });
    expect(FileSystem.uploadAsync).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the document when the device is offline", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    await expect(uploadScannedDocument(scanDocument, "family-1")).rejects.toMatchObject({ status: 0 });
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

describe("describeScanFailure", () => {
  it("names the upload leg without echoing the generic upload fallback", () => {
    const failure = describeScanFailure(
      "upload",
      new ApiError("Der Upload konnte nicht abgeschlossen werden.", 500),
    );
    expect(failure.message).toBe("Der Upload hat nicht geklappt. Du kannst es erneut versuchen.");
    expect(failure.detail).toBeUndefined();
    expect(failure.reason).toBe("server");
  });

  it("explains a missing connection as the cause", () => {
    const failure = describeScanFailure(
      "upload",
      new ApiError("Keine Verbindung. Dein Dokument bleibt gespeichert.", 0),
    );
    expect(failure.detail).toBe("Keine Verbindung. Dein Dokument bleibt auf diesem Gerät gespeichert.");
    expect(failure.reason).toBe("network");
  });

  it("names the OCR leg and keeps a specific server message as the detail", () => {
    const failure = describeScanFailure(
      "ocr",
      new Error("Der Dienst ist vorübergehend nicht erreichbar."),
    );
    expect(failure.message).toBe("Die Texterkennung hat nicht geklappt. Du kannst sie erneut starten.");
    expect(failure.detail).toBe("Der Dienst ist vorübergehend nicht erreichbar.");
    expect(failure.reason).toBe("unknown");
  });

  it("names the analysis leg", () => {
    expect(describeScanFailure("analysis", new Error("x")).message).toContain("Analyse");
  });

  it("points at the missing AI consent", () => {
    const failure = describeScanFailure(
      "ocr",
      new ApiError("Das hat nicht geklappt. Bitte versuch's nochmal.", 403, "AI_CONSENT_REQUIRED"),
    );
    expect(failure.reason).toBe("consent");
    expect(failure.detail).toContain("Zustimmung");
  });

  it("keeps size and quota refusals actionable", () => {
    expect(describeScanFailure("upload", new ApiError("x", 413))).toMatchObject({
      reason: "file_too_large",
      detail: expect.stringContaining("20 MB"),
    });
    expect(describeScanFailure("upload", new ApiError("x", 429))).toMatchObject({
      reason: "quota_limited",
    });
  });

  it("suppresses generic fallback messages as detail", () => {
    const failure = describeScanFailure(
      "analysis",
      new Error("Die Verarbeitung des Dokuments ist fehlgeschlagen."),
    );
    expect(failure.detail).toBeUndefined();
  });
});

describe("ScanStageError from pipeline polling", () => {
  it("carries the server-recorded failure stage through polling", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { status: "failed", failure_stage: "analyze" },
      error: null,
    });

    await expect(
      waitForScannedDocumentAnalysis("document-1", undefined, 0),
    ).rejects.toMatchObject({ name: "ScanStageError", stage: "analysis" });
  });

  it("maps an OCR failure to the OCR leg", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { status: "failed", failure_stage: "ocr" },
      error: null,
    });

    await expect(
      waitForScannedDocumentAnalysis("document-1", undefined, 0),
    ).rejects.toMatchObject({ stage: "ocr" });
  });

  it("leaves the stage open when the server recorded none", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { status: "failed", failure_stage: null },
      error: null,
    });

    await expect(
      waitForScannedDocumentAnalysis("document-1", undefined, 0),
    ).rejects.toMatchObject({ stage: undefined });
  });
});
