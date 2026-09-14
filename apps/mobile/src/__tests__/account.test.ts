import * as Sharing from "expo-sharing";
import { apiFetch } from "../lib/api";
import { shareAccountDataExport } from "../lib/account";

const mockFiles = new Map<string, string>();

jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    write(value: string) {
      mockFiles.set(this.uri, value);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: "cache" } };
});
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock("../lib/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, code: number) {
      super(message);
      this.status = code;
    }
  }
  return { ApiError, apiFetch: jest.fn() };
});

describe("shareAccountDataExport", () => {
  beforeEach(() => {
    mockFiles.clear();
    jest.clearAllMocks();
    jest.mocked(apiFetch).mockResolvedValue(
      new Response('{"format":"ordilo-data-export"}'),
    );
  });

  it("shares the authenticated JSON export and removes its temporary copy", async () => {
    await shareAccountDataExport();

    expect(apiFetch).toHaveBeenCalledWith("/api/me/export");
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      expect.stringMatching(
        /^cache\/account-exports\/ordilo-daten-\d{4}-\d{2}-\d{2}\.json$/,
      ),
      expect.objectContaining({ mimeType: "application/json" }),
    );
    expect(mockFiles.size).toBe(0);
  });

  it("removes the temporary plaintext file when sharing fails", async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("cancelled"));

    await expect(shareAccountDataExport()).rejects.toThrow("cancelled");

    expect(mockFiles.size).toBe(0);
  });

  it("does not download sensitive data when sharing is unavailable", async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);

    await expect(shareAccountDataExport()).rejects.toThrow(
      "Teilen ist auf diesem Gerät nicht verfügbar.",
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
