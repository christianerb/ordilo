import { describe, it, expect } from "vitest";
import {
  SIGNED_URL_TTL_SECONDS,
  sanitizeFilename,
  buildStoragePath,
  readFileHeaderBytes,
} from "@/lib/api/storage";

describe("sanitizeFilename", () => {
  it("keeps safe characters untouched", () => {
    expect(sanitizeFilename("rechnung-2026.pdf", "document")).toBe(
      "rechnung-2026.pdf",
    );
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeFilename("meine datei (1).pdf", "document")).toBe(
      "meine_datei__1_.pdf",
    );
  });

  it("uses the fallback only for an empty filename", () => {
    expect(sanitizeFilename("###", "document")).toBe("___");
    expect(sanitizeFilename("", "photo")).toBe("photo");
  });
});

describe("buildStoragePath", () => {
  it("joins segments with slashes", () => {
    expect(buildStoragePath("fam", "doc", "file.pdf")).toBe(
      "fam/doc/file.pdf",
    );
  });
});

describe("SIGNED_URL_TTL_SECONDS", () => {
  it("is 300 seconds", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(300);
  });
});

describe("readFileHeaderBytes", () => {
  it("returns the first 16 bytes of a larger file", async () => {
    const bytes = new Uint8Array(32).map((_, i) => i);
    const file = new File([bytes], "scan.pdf", { type: "application/pdf" });
    const result = await readFileHeaderBytes(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headerBytes).toHaveLength(16);
    expect(Array.from(result.headerBytes)).toEqual(Array.from(bytes.slice(0, 16)));
  });

  it("returns all bytes for a file smaller than 16 bytes", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "tiny.png");
    const result = await readFileHeaderBytes(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.headerBytes)).toEqual([1, 2, 3]);
  });
});
