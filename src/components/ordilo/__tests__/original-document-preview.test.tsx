import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OriginalDocumentPreview } from "../original-document-preview";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OriginalDocumentPreview", () => {
  it("renders the original beside the review on desktop", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/signed",
          mimeType: "application/pdf",
        }),
        { status: 200 },
      ),
    );

    render(
      <OriginalDocumentPreview
        documentId="doc-1"
        title="Stromrechnung"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByTestId("original-document-preview-desktop"),
    ).toBeDefined();
    expect(
      await screen.findByTitle("Original von Stromrechnung"),
    ).toBeDefined();
  });
});
