import { drainIntake } from "../lib/intake-worker";
import { ApiError } from "../lib/api";
import { resumeScannedDocument, uploadScannedDocument, type PersistedScanQueueItem } from "../lib/scan";

let mockQueue: PersistedScanQueueItem[] = [];
jest.mock("../lib/api", () => ({ ApiError: class extends Error { status: number; code?: string; constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; } } }));
jest.mock("../lib/scan", () => ({
  loadPersistedScanQueue: jest.fn(async () => mockQueue),
  mutateScanQueue: jest.fn(async (_family: string, transform: (items: PersistedScanQueueItem[]) => PersistedScanQueueItem[]) => { mockQueue = transform(mockQueue); return mockQueue; }),
  uploadScannedDocument: jest.fn(),
  resumeScannedDocument: jest.fn(async () => {}),
  removeStagedScannedDocument: jest.fn(async () => {}),
  // Mirrors lib/scan's classifier — the unit under test is the worker,
  // not the mapping (that one is covered in scan.test.ts).
  classifyScanFailureReason: jest.fn((error: unknown) => {
    const status = error instanceof Error && "status" in error ? (error as { status?: number }).status : undefined;
    const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "AI_CONSENT_REQUIRED") return "consent";
    if (status === 0) return "network";
    if (status === 401) return "auth";
    if (status === 403) return "access_denied";
    if (status === 413) return "file_too_large";
    if (status === 429) return "quota_limited";
    if (status !== undefined && (status === 408 || status >= 500)) return "server";
    return "unknown";
  }),
}));
jest.mock("../lib/analytics", () => ({ recordScanFailure: jest.fn(async () => {}) }));
const recordScanFailure = jest.mocked(jest.requireMock("../lib/analytics").recordScanFailure);
const upload = jest.mocked(uploadScannedDocument);
beforeEach(() => {
  jest.clearAllMocks();
  mockQueue = [0, 1, 2].map((id) => ({ id: `document-${id}`, name: "test.pdf", uri: `file:///${id}`, mimeType: "application/pdf", state: "queued" }));
});

it("hands every file to the server with at most two concurrent uploads", async () => {
  let active = 0;
  let maximum = 0;
  upload.mockImplementation(async (item) => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return { document_id: item.id, status: "uploaded", server_pipeline: true };
  });
  await drainIntake("family", () => true);
  expect(maximum).toBe(2);
  expect(upload).toHaveBeenCalledTimes(3);
  expect(mockQueue).toEqual([]);
});

it("retains offline files and reuses their upload keys on retry", async () => {
  upload.mockRejectedValue(new ApiError("offline", 0));
  await drainIntake("family", () => true);
  expect(mockQueue).toHaveLength(3);
  expect(mockQueue.every((item) => item.state === "queued")).toBe(true);
  // Retryable blips are not scan failures — the quality signal stays clean.
  expect(recordScanFailure).not.toHaveBeenCalled();
  upload.mockImplementation(async (item) => ({ document_id: item.id, status: "uploaded", server_pipeline: true }));
  await drainIntake("family", () => true);
  expect(mockQueue).toEqual([]);
});

it("does not reupload a checkpointed server handoff", async () => {
  mockQueue = [{ ...mockQueue[0], documentId: "server-id", serverPipeline: true, state: "processing" }];
  await drainIntake("family", () => true);
  expect(upload).not.toHaveBeenCalled();
  expect(mockQueue).toEqual([]);
});

it("automatically resumes a checkpoint after a transient status failure without reuploading", async () => {
  mockQueue = [{ ...mockQueue[0], documentId: "server-id", serverPipeline: false, state: "processing" }];
  jest.mocked(resumeScannedDocument).mockRejectedValueOnce(new ApiError("offline", 503));
  await drainIntake("family", () => true);
  expect(mockQueue[0]).toMatchObject({ state: "processing", documentId: "server-id" });
  await drainIntake("family", () => true);
  expect(mockQueue).toEqual([]);
  expect(upload).not.toHaveBeenCalled();
  expect(resumeScannedDocument).toHaveBeenCalledTimes(2);
});

it("does not start work after the account or route changes", async () => {
  await drainIntake("family", () => false);
  expect(upload).not.toHaveBeenCalled();
  expect(mockQueue).toHaveLength(3);
});

it("explains a missing AI consent instead of the generic access refusal", async () => {
  upload.mockRejectedValue(new ApiError("Einwilligung fehlt", 403, "AI_CONSENT_REQUIRED"));
  await drainIntake("family", () => true);
  expect(mockQueue.every((item) => item.state === "failed")).toBe(true);
  expect(mockQueue[0].error).toBe("Ordilo braucht deine Zustimmung zur KI-Verarbeitung. Du findest sie in den Einstellungen.");
});

it("keeps permanent failures for explicit retry", async () => {
  upload.mockRejectedValue(new ApiError("too large", 413));
  await drainIntake("family", () => true);
  await drainIntake("family", () => true);
  expect(upload).toHaveBeenCalledTimes(3);
  expect(mockQueue.every((item) => item.state === "failed")).toBe(true);
  expect(recordScanFailure).toHaveBeenCalledTimes(3);
  expect(recordScanFailure).toHaveBeenCalledWith({
    familyId: "family",
    stage: "upload",
    reason: "file_too_large",
  });
});
