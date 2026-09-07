import { clearOfflineDocuments, retainOfflineFamily, listOfflineDocuments, readOfflineDocument, removeOfflineDocument, saveOfflineDocument, shareOfflineOriginal } from "../lib/offline-documents";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";

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
// Exercise real authenticated encryption in Node; native device integration is covered by device acceptance.
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
const snapshot = { id: "doc1", title: "Sensitive title", mimeType: "application/pdf", summary: "Personal summary", ocrText: "Sensitive text" };
const url = async () => "https://signed.example/file";
const fetchMock = jest.fn();
beforeEach(async () => {
  await clearOfflineDocuments();
  jest.clearAllMocks();
  global.fetch = fetchMock;
  fetchMock.mockResolvedValue({ ok: true, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode("%PDF-private").buffer });
});
test("persists encrypted originals and text; reads without network and isolates accounts and families", async () => {
  const saved = await saveOfflineDocument("user1", "family1", snapshot, url);
  expect([...mockFiles.values()].join("")).not.toContain("Sensitive");
  expect([...mockFiles.values()].join("")).not.toContain("%PDF");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), { keychainAccessible: 7 });
  fetchMock.mockRejectedValue(new Error("offline"));
  const summary: Omit<typeof saved, "original"> & { original?: string } = { ...saved };
  delete summary.original;
  expect(await listOfflineDocuments("user1", "family1")).toEqual([summary]);
  expect(await readOfflineDocument("user1", "family1", "doc1")).toEqual(saved);
  expect(await listOfflineDocuments("user2")).toEqual([]);
  expect(await listOfflineDocuments("user1", "family2")).toEqual([]);
  await removeOfflineDocument("user1", "family1", snapshot.id);
  expect(await listOfflineDocuments("user1")).toEqual([]);
});
test("authentication rejects modified ciphertext", async () => {
  await saveOfflineDocument("user1", "family1", snapshot, url);
  const [path, value] = [...mockFiles][0];
  const corrupt = Buffer.from(value, "base64"); corrupt[20] ^= 1;
  mockFiles.set(path, corrupt.toString("base64"));
  await expect(listOfflineDocuments("user1")).rejects.toThrow();
});
test("sign-out cancels an in-flight save and destroys both key and copies", async () => {
  let release!: () => void;
  const pendingUrl = () => new Promise<string>((resolve) => { release = () => resolve("https://signed.example/file"); });
  const saving = saveOfflineDocument("user1", "family1", snapshot, pendingUrl);
  await Promise.resolve();
  const clearing = clearOfflineDocuments();
  release();
  await expect(saving).rejects.toThrow("abgebrochen");
  await clearing;
  expect(await listOfflineDocuments("user1")).toEqual([]);
  expect(await SecureStore.getItemAsync("ordilo.offline.aes.v1")).toBeNull();
});
test("deletes temporary plaintext export even if sharing fails", async () => {
  const saved = await saveOfflineDocument("user1", "family1", snapshot, url);
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("cancelled"));
  await expect(shareOfflineOriginal(saved)).rejects.toThrow("cancelled");
  expect([...mockFiles.keys()].some((path) => path.startsWith("cache/"))).toBe(false);
});
test("rejects oversized files before storing a copy", async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, headers: { get: () => String(16 * 1024 * 1024) } });
  await expect(saveOfflineDocument("user1", "family1", snapshot, url)).rejects.toThrow("15 MB");
  expect(mockFiles.size).toBe(0);
});

test("a confirmed family change purges old copies and denies already-loaded exports", async () => {
  const former = await saveOfflineDocument("user1", "old-family", snapshot, url);
  await saveOfflineDocument("user1", "new-family", snapshot, url);
  await retainOfflineFamily("user1", "new-family");
  expect((await listOfflineDocuments("user1")).map((entry) => entry.familyId)).toEqual(["new-family"]);
  expect([...mockFiles.keys()].some((path) => path.includes("old-family"))).toBe(false);
  await expect(readOfflineDocument("user1", "old-family", "doc1")).rejects.toThrow("keinen Zugriff");
  await expect(shareOfflineOriginal(former)).rejects.toThrow("keinen Zugriff");
  await expect(saveOfflineDocument("user1", "old-family", snapshot, url)).rejects.toThrow("keinen Zugriff");
  await retainOfflineFamily("user1", null);
  expect(await listOfflineDocuments("user1")).toEqual([]);
});

test("destroys the encryption key when former-family files cannot be removed", async () => {
  await saveOfflineDocument("user1", "old-family", snapshot, url);
  const deletion = jest.spyOn(File.prototype, "delete").mockImplementationOnce(() => { throw new Error("filesystem unavailable"); });
  await expect(retainOfflineFamily("user1", "new-family")).rejects.toThrow("filesystem unavailable");
  expect(await SecureStore.getItemAsync("ordilo.offline.aes.v1")).toBeNull();
  expect(await listOfflineDocuments("user1", "old-family")).toEqual([]);
  deletion.mockRestore();
});
