import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ordilo/review-card", () => ({
  ReviewCard: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <button type="button" onClick={() => onDirtyChange?.(true)}>
      Änderung machen
    </button>
  ),
}));

import { DocumentDetailSheet } from "@/components/ordilo/document-detail-sheet";

const document = {
  id: "doc-1",
  title: "Kita-Gutschein",
  original_filename: "scan.jpg",
  mime_type: "image/jpeg",
  status: "analyzed",
  error_message: null,
  failure_stage: null,
  failure_code: null,
};

describe("DocumentDetailSheet", () => {
  it("shows the document status in the header", () => {
    render(
      <DocumentDetailSheet
        document={document as never}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Kita-Gutschein")).toBeDefined();
    expect(screen.getByText("Bereit zum Durchsehen")).toBeDefined();
  });

  it("protects unsaved corrections when the sheet is closed", async () => {
    const onOpenChange = vi.fn();
    render(
      <DocumentDetailSheet
        document={document as never}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Änderung machen" }));
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Änderungen verwerfen?")).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Weiter bearbeiten" }),
    );
    expect(screen.getByTestId("document-detail-sheet")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Verwerfen",
      }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
