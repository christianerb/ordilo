import { clearOfflineDocuments, readOfflineDocument, refreshOfflineCopy, saveOfflineDocument } from "../lib/offline-documents";
import { loadOriginalFile } from "../lib/document-review";

const mockFiles = new Map<string, string>();
const mockDirectories = new Set<string>();
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) { this.uri = parts.map((p) => typeof p === "string" ? p : p.uri).join("/"); }
    get exists() { return mockDirectories.has(this.uri); }
    create() { mockDirectories.add(this.uri); }
    delete() { mockDirectories.delete(this.uri); for (const path of mockFiles.keys()) if (path.startsWith(this.uri + "/")) mockFiles.delete(path); }
    list() { return [...mockFiles.keys()].filter((p) => p.startsWith(this.uri + "/")).map((p) => new File(p)); }
  }
  class File {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) { this.uri = parts.map((p) => typeof p === "string" ? p : p.uri).join("/"); }
    get name() { return this.uri.split("/").pop()!; }
    get exists() { return mockFiles.has(this.uri); }
    write(value: string) { mockFiles.set(this.uri, value); }
    text() { return Promise.resolve(mockFiles.get(this.uri)); }
    delete() { mockFiles.delete(this.uri); }
  }
  return { Directory, File, Paths: { document: "documents", cache: "cache" } };
});
jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }),
  };
});
// Real authenticated encryption in Node, same as the offline-documents tests.
jest.mock("expo-crypto", () => {
  const crypto = jest.requireActual("node:crypto") as typeof import("node:crypto");
  const makeKey = (bytes: Buffer) => ({ bytes, encoded: async () => bytes.toString("base64") });
  return {
    AESEncryptionKey: { generate: async () => makeKey(crypto.randomBytes(32)), import: async (value: string) => makeKey(Buffer.from(value, "base64")) },
    AESSealedData: { fromCombined: (value: string) => Buffer.from(value, "base64") },
    aesEncryptAsync: async (plaintext: Uint8Array, key: { bytes: Buffer }) => {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key.bytes, nonce);
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return { combined: async () => Buffer.concat([nonce, encrypted, cipher.getAuthTag()]).toString("base64") };
    },
    aesDecryptAsync: async (sealed: Buffer, key: { bytes: Buffer }) => {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key.bytes, sealed.subarray(0, 12));
      decipher.setAuthTag(sealed.subarray(-16));
      return Buffer.concat([decipher.update(sealed.subarray(12, -16)), decipher.final()]);
    },
  };
});
jest.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: jest.fn().mockResolvedValue(undefined) }));

const mockSession: { userId: string | null } = { userId: "user1" };
const mockMaybeSingle = jest.fn();
jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: mockSession.userId ? { user: { id: mockSession.userId } } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));
jest.mock("../lib/document-review", () => ({ loadOriginalFile: jest.fn() }));

const snapshot = { id: "doc1", title: "Alter Titel", mimeType: "application/pdf", summary: "Alte Zusammenfassung", ocrText: "Alter Text" };
const url = async () => "https://signed.example/file";
const fetchMock = jest.fn();
const correctedRow = { title: "Neuer Titel", mime_type: "application/pdf", summary: "Neue Zusammenfassung", ocr_text: "Neuer Text" };

beforeEach(async () => {
  await clearOfflineDocuments();
  jest.clearAllMocks();
  mockSession.userId = "user1";
  global.fetch = fetchMock;
  fetchMock.mockResolvedValue({ ok: true, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode("%PDF-private").buffer });
  mockMaybeSingle.mockResolvedValue({ data: correctedRow, error: null });
  jest.mocked(loadOriginalFile).mockResolvedValue({ url: "https://signed.example/fresh", mimeType: "application/pdf" });
});

test("re-encrypts the cached copy with corrected data and a fresh original", async () => {
  const original = await saveOfflineDocument("user1", "family1", snapshot, url);
  await expect(refreshOfflineCopy("doc1")).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith("https://signed.example/fresh");
  const copy = await readOfflineDocument("user1", "family1", "doc1");
  expect(copy.title).toBe("Neuer Titel");
  expect(copy.summary).toBe("Neue Zusammenfassung");
  expect(copy.ocrText).toBe("Neuer Text");
  expect(Date.parse(copy.savedAt)).toBeGreaterThanOrEqual(Date.parse(original.savedAt));
  expect([...mockFiles.values()].join("")).not.toContain("Neuer Titel");
});

test("is a no-op when the document was never marked for offline use", async () => {
  await expect(refreshOfflineCopy("doc1")).resolves.toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(loadOriginalFile).not.toHaveBeenCalled();
});

test("keeps the old copy and never throws when the device is offline", async () => {
  await saveOfflineDocument("user1", "family1", snapshot, url);
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock.mockRejectedValue(new Error("offline"));
  await expect(refreshOfflineCopy("doc1")).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  const copy = await readOfflineDocument("user1", "family1", "doc1");
  expect(copy.title).toBe("Alter Titel");
});

test("is a no-op without a signed-in session", async () => {
  await saveOfflineDocument("user1", "family1", snapshot, url);
  mockSession.userId = null;
  fetchMock.mockClear();
  await expect(refreshOfflineCopy("doc1")).resolves.toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("leaves the old copy untouched when the document row is gone", async () => {
  await saveOfflineDocument("user1", "family1", snapshot, url);
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  fetchMock.mockClear();
  await expect(refreshOfflineCopy("doc1")).resolves.toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
  const copy = await readOfflineDocument("user1", "family1", "doc1");
  expect(copy.title).toBe("Alter Titel");
});
