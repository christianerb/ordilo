import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/realtime/use-live-conversation.ts"),
  "utf8",
);

describe("web Live setup lifecycle", () => {
  it("aborts setup before closing the peer so the server can clean up", () => {
    expect(source).toContain("const setupAbort = new AbortController()");
    expect(source).toContain("signal: setupAbort.signal");
    expect(source).toContain("setupAbortRef.current?.abort()");
    expect(source.indexOf("setupAbortRef.current?.abort()")).toBeLessThan(
      source.indexOf("pcRef.current?.close()"),
    );
  });
});
