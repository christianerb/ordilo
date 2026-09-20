import { stageSharedDocuments, sharedDocumentInput } from "../lib/shared-intake";
import { loadPersistedScanQueue, reconcileScanQueue, stageScannedDocument } from "../lib/scan";
import type { ResolvedSharePayload } from "expo-sharing";
import { redirectSystemPath } from "../../app/+native-intent";

jest.mock("../lib/scan", () => ({
  ...jest.requireActual("../lib/scan"),
  loadPersistedScanQueue: jest.fn(), reconcileScanQueue: jest.fn(), stageScannedDocument: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA256" }, digestStringAsync: async (_: string, value: string) => value.includes("second") ? "second-import" : "first-import" }));
const payload = { value: "file:///inbox/brief.pdf", shareType: "file", contentUri: "file:///inbox/brief.pdf", contentType: "file", contentMimeType: "application/pdf", originalName: "brief.pdf", contentSize: 123 } as ResolvedSharePayload;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadPersistedScanQueue).mockResolvedValue([]);
  jest.mocked(stageScannedDocument).mockImplementation(async (document) => document);
  jest.mocked(reconcileScanQueue).mockImplementation(async (queue) => queue);
});

it("routes only native sharing links to intake and preserves invitations", () => {
  expect(redirectSystemPath({ path: "ordilo://expo-sharing", initial: true })).toBe("/empfangen");
  expect(redirectSystemPath({ path: "ordilo://invite/abc", initial: true })).toBe("ordilo://invite/abc");
});
it("rejects remote file URLs rather than fetching arbitrary sites", () => {
  expect(() => sharedDocumentInput({ ...payload, contentUri: "https://example.com/document.pdf" }, "import-1")).toThrow("PDF-Datei");
});
it("replaces a Photos-app UUID filename with a friendly label, keeping a real name as-is", () => {
  expect(sharedDocumentInput(payload, "import-1").name).toBe("brief.pdf");
  expect(
    sharedDocumentInput(
      { ...payload, contentType: "image", originalName: "60F9043C-DD4A-424F-9D3C-29B3F00C7F8B.jpg" } as ResolvedSharePayload,
      "import-1",
    ).name,
  ).toBe("Foto.jpg");
  expect(
    sharedDocumentInput(
      { ...payload, originalName: "60f9043c-dd4a-424f-9d3c-29b3f00c7f8b.pdf" } as ResolvedSharePayload,
      "import-1",
    ).name,
  ).toBe("Dokument.pdf");
});
it("stages and checkpoints imports in the selected family before acknowledging", async () => {
  await stageSharedDocuments([payload], "family-1");
  expect(stageScannedDocument).toHaveBeenCalledWith(expect.objectContaining({ name: "brief.pdf", id: "shared-first-import" }), "family-1");
  expect(reconcileScanQueue).toHaveBeenCalledWith([expect.objectContaining({ state: "queued" })], "family-1", []);
});
it("does not duplicate an attachment when the native delivery is replayed", async () => {
  jest.mocked(loadPersistedScanQueue).mockResolvedValue([{ id: "shared-first-import", uri: payload.contentUri!, name: "brief.pdf", mimeType: "application/pdf", state: "queued" }]);
  await stageSharedDocuments([payload], "family-1");
  expect(stageScannedDocument).not.toHaveBeenCalled();
});
it("propagates a failed checkpoint so the native payload remains recoverable", async () => {
  jest.mocked(reconcileScanQueue).mockRejectedValue(new Error("disk full"));
  await expect(stageSharedDocuments([payload], "family-1")).rejects.toThrow("disk full");
});
