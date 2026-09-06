import { hasIncomingShare, readShareInbox } from "../lib/share-inbox";

const mockFiles = new Map<string, string>();
jest.mock("expo-sharing", () => ({ clearSharedPayloads: jest.fn(), getResolvedSharedPayloadsAsync: jest.fn(), getSharedPayloads: jest.fn(() => []) }));
jest.mock("expo-file-system", () => {
  const uri = (parts: (string | { uri: string })[]) => parts.map((p) => typeof p === "string" ? p : p.uri).join("/");
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts); }
    get name() { return this.uri.split("/").pop(); }
    get exists() { return [...mockFiles.keys()].some((key) => key.startsWith(`${this.uri}/`)); }
    list() { return [...new Set([...mockFiles.keys()].filter((key) => key.startsWith(`${this.uri}/`)).map((key) => key.slice(this.uri.length + 1).split("/")[0]))].map((name) => new Directory(this.uri, name)); }
    delete() { for (const key of mockFiles.keys()) if (key.startsWith(`${this.uri}/`)) mockFiles.delete(key); }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts); }
    get exists() { return mockFiles.has(this.uri); }
    async text() { return mockFiles.get(this.uri); }
  }
  return { Directory, File, Paths: { appleSharedContainers: { "group.com.ordilo.app": new Directory("file:///group") } } };
});

function commit(id: string) {
  const uri = `file:///group/ordilo-inbox/${id}/brief.pdf`;
  mockFiles.set(uri, "pdf");
  mockFiles.set(`file:///group/ordilo-inbox/${id}/ready.json`, JSON.stringify([{ value: uri, shareType: "file", mimeType: "application/pdf", contentUri: uri, contentType: "file", contentMimeType: "application/pdf", originalName: "brief.pdf", contentSize: 32 }]));
}
beforeEach(() => mockFiles.clear());
it("ignores a share interrupted before the atomic commit", async () => {
  mockFiles.set("file:///group/ordilo-inbox/interrupted/brief.pdf", "pdf");
  expect(hasIncomingShare()).toBe(false);
  expect(await readShareInbox()).toEqual([]);
});
it("acknowledges only the staged delivery and preserves a later same-name file", async () => {
  commit("first");
  const [delivery] = await readShareInbox();
  commit("second");
  delivery.acknowledge();
  const remaining = await readShareInbox();
  expect(remaining.map((entry) => entry.id)).toEqual(["second"]);
  expect(remaining[0].payloads[0].originalName).toBe("brief.pdf");
  expect(hasIncomingShare()).toBe(true);
});
it("keeps malformed committed input for recovery rather than silently clearing it", async () => {
  mockFiles.set("file:///group/ordilo-inbox/broken/ready.json", "broken");
  await expect(readShareInbox()).rejects.toThrow();
  expect(hasIncomingShare()).toBe(true);
});
it("refuses manifests that point outside their delivery directory", async () => {
  commit("first");
  const key = "file:///group/ordilo-inbox/first/ready.json";
  mockFiles.set(key, mockFiles.get(key)!.replaceAll("first/brief.pdf", "other/brief.pdf"));
  await expect(readShareInbox()).rejects.toThrow("Eingang");
});
