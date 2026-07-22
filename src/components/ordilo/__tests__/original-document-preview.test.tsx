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

  it("marks a uniquely matched source passage in a desktop image preview", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/source")) {
        return new Response(
          JSON.stringify({
            location: {
              pageNumber: 1,
              bounds: { left: 0.1, top: 0.2, width: 0.3, height: 0.1 },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          url: "https://storage.example.com/signed",
          mimeType: "image/jpeg",
        }),
        { status: 200 },
      );
    });

    render(
      <OriginalDocumentPreview
        documentId="doc-1"
        title="Stromrechnung"
        open
        sourceText="11,00 Euro"
        onOpenChange={vi.fn()}
      />,
    );

    const highlight = await screen.findByLabelText("Passage im Original");
    expect(highlight).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "10%",
    });
  });
});
