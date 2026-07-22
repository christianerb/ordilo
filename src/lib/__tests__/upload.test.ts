import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadFile } from "@/lib/upload";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/lib/schemas/document";

// ---------------------------------------------------------------------------
// Helpers: minimal XHR mock
// ---------------------------------------------------------------------------

type EventCallback = (event: ProgressEvent) => void;

function createMockXHR() {
  const listeners: Record<string, EventCallback> = {};
  const xhr = {
    status: 0,
    responseText: "",
    timeout: 0,
    upload: { addEventListener: vi.fn() },
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    abort: vi.fn(),
    addEventListener: vi.fn((event: string, cb: EventCallback) => {
      listeners[event] = cb;
    }),
  };
  return { xhr, listeners };
}

describe("uploadFile", () => {
  const realXHR = globalThis.XMLHttpRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = realXHR;
  });

  function installMock() {
    const { xhr, listeners } = createMockXHR();
    // Use a regular function (not arrow) so `new XMLHttpRequest()` works.
    globalThis.XMLHttpRequest = vi.fn(function () {
      return xhr;
    }) as unknown as typeof XMLHttpRequest;
    return { xhr, listeners };
  }

  // --- Pre-flight size check ---

  it("rejects oversized files immediately without opening a connection", async () => {
    const { xhr } = installMock();

    const oversizedFile = new File(
      ["x".repeat(MAX_FILE_SIZE + 1)],
      "big.pdf",
      { type: "application/pdf" },
    );

    await expect(
      uploadFile(oversizedFile, "family-id"),
    ).rejects.toThrow(`Die Datei ist zu groß. Maximum: ${MAX_FILE_SIZE_LABEL}.`);

    // XHR.open must never have been called — the pre-flight check
    // short-circuits before any network activity.
    expect(xhr.open).not.toHaveBeenCalled();
  });

  // --- 413 handling (platform-level rejection, non-JSON body) ---

  it("rejects with a German size message on 413 with non-JSON body (Vercel platform)", async () => {
    const { xhr, listeners } = installMock();

    const file = new File(["x"], "test.pdf", { type: "application/pdf" });
    const promise = uploadFile(file, "family-id");

    // Simulate Vercel returning a 413 with an HTML error page.
    xhr.status = 413;
    xhr.responseText = "<html><body>FUNCTION_PAYLOAD_TOO_LARGE</body></html>";
    listeners.load?.({} as ProgressEvent);

    await expect(promise).rejects.toThrow(
      `Die Datei ist zu groß. Maximum: ${MAX_FILE_SIZE_LABEL}.`,
    );
  });

  // --- 413 handling (app-level JSON response) ---

  it("rejects with the server's error message on 413 with JSON body", async () => {
    const { xhr, listeners } = installMock();

    const file = new File(["x"], "test.pdf", { type: "application/pdf" });
    const promise = uploadFile(file, "family-id");

    xhr.status = 413;
    xhr.responseText = JSON.stringify({
      error: "Die Datei ist zu groß. Maximum: 4 MB.",
      code: "FILE_TOO_LARGE",
    });
    listeners.load?.({} as ProgressEvent);

    await expect(promise).rejects.toThrow("Die Datei ist zu groß. Maximum: 4 MB.");
  });

  // --- Success ---

  it("resolves with document_id on 200", async () => {
    const { xhr, listeners } = installMock();

    const file = new File(["x"], "test.pdf", { type: "application/pdf" });
    const promise = uploadFile(file, "family-id");

    xhr.status = 200;
    xhr.responseText = JSON.stringify({
      document_id: "doc-123",
      status: "uploaded",
      server_pipeline: true,
    });
    listeners.load?.({} as ProgressEvent);

    await expect(promise).resolves.toEqual({
      document_id: "doc-123",
      status: "uploaded",
      server_pipeline: true,
    });
  });
});
