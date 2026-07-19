import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryFailedDocument } from "@/lib/document-retry";
import { triggerOcr } from "@/lib/ocr";

vi.mock("@/lib/ocr", () => ({
  triggerOcr: vi.fn(),
}));

describe("retryFailedDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries OCR failures through the OCR endpoint helper", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await retryFailedDocument("doc-1", "ocr");

    expect(triggerOcr).toHaveBeenCalledWith("doc-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["analysis", "confirmation"] as const)(
    "restores %s failures by rerunning analysis on the existing document",
    async (stage) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(null, { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await retryFailedDocument("doc-1", stage);

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/documents/doc-1/analyze",
        { method: "POST" },
      );
      expect(triggerOcr).not.toHaveBeenCalled();
    },
  );

  it("surfaces the structured API error when retry fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: "OpenAI ist nicht erreichbar." },
          { status: 502 },
        ),
      ),
    );

    await expect(
      retryFailedDocument("doc-1", "analysis"),
    ).rejects.toThrow("OpenAI ist nicht erreichbar.");
  });
});
