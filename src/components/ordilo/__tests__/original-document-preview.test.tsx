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

  it("shows the full image width and lets tall originals scroll", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/signed",
          mimeType: "image/jpeg",
        }),
        { status: 200 },
      ),
    );

    render(
      <OriginalDocumentPreview
        documentId="doc-1"
        title="Kita-Gutschein"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const image = await screen.findByAltText("Original von Kita-Gutschein");
    expect(image).toHaveClass("h-auto", "w-full");
    expect(image.parentElement?.parentElement).toHaveClass("overflow-auto");
  });

  it("recognizes older image records from the signed URL when MIME data is missing", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/documents/scan.jpg?token=signed",
          mimeType: null,
        }),
        { status: 200 },
      ),
    );

    render(
      <OriginalDocumentPreview
        documentId="doc-1"
        title="Alter Scan"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByAltText("Original von Alter Scan")).toBeDefined();
    expect(screen.queryByTitle("Original von Alter Scan")).toBeNull();
  });
});
