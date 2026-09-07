import { drainIntake } from "../lib/intake-worker";
import { ApiError } from "../lib/api";
import { uploadScannedDocument, type PersistedScanQueueItem } from "../lib/scan";

let mockQueue: PersistedScanQueueItem[] = [];
jest.mock("../lib/api", () => ({ ApiError: class extends Error { status: number; constructor(message: string, code: number) { super(message); this.status = code; } } }));
jest.mock("../lib/scan", () => ({
  loadPersistedScanQueue: jest.fn(async () => mockQueue),
  mutateScanQueue: jest.fn(async (_family: string, transform: (items: PersistedScanQueueItem[]) => PersistedScanQueueItem[]) => { mockQueue = transform(mockQueue); return mockQueue; }),
  uploadScannedDocument: jest.fn(),
  resumeScannedDocument: jest.fn(async () => {}),
  removeStagedScannedDocument: jest.fn(async () => {}),
}));
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

it("does not start work after the account or route changes", async () => {
  await drainIntake("family", () => false);
  expect(upload).not.toHaveBeenCalled();
  expect(mockQueue).toHaveLength(3);
});

it("keeps permanent failures for explicit retry", async () => {
  upload.mockRejectedValue(new ApiError("too large", 413));
  await drainIntake("family", () => true);
  await drainIntake("family", () => true);
  expect(upload).toHaveBeenCalledTimes(3);
  expect(mockQueue.every((item) => item.state === "failed")).toBe(true);
});
