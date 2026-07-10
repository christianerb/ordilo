import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ScanProcessingStep } from "../processing-step";
import type { Database } from "@/types/database";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

function makeDoc(status: string, overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "doc-1",
    family_id: "fam-1",
    uploaded_by: "user-1",
    title: null,
    document_type: null,
    category: null,
    status,
    file_url: "fam-1/doc-1/scan.jpg",
    original_filename: "scan.jpg",
    mime_type: "image/jpeg",
    page_count: null,
    ocr_text: null,
    summary: null,
    error_message: null,
    created_at: new Date().toISOString(),
    confirmed_at: null,
    ...overrides,
  } as DocumentRow;
}

describe("ScanProcessingStep", () => {
  it("shows only the upload step as pending/active while doc is null", () => {
    render(
      <ScanProcessingStep doc={null} onRetry={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("processing-step-upload")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("processing-step-ocr")).toHaveAttribute(
      "data-state",
      "pending",
    );
    expect(screen.getByTestId("processing-step-analysis")).toHaveAttribute(
      "data-state",
      "pending",
    );
  });

  it("marks the upload step done and the OCR step active for status 'uploaded'", () => {
    render(
      <ScanProcessingStep doc={makeDoc("uploaded")} onRetry={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("processing-step-upload")).toHaveAttribute(
      "data-state",
      "done",
    );
    expect(screen.getByTestId("processing-step-ocr")).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("marks upload and OCR done and analysis active for status 'ocr_done'", () => {
    render(
      <ScanProcessingStep doc={makeDoc("ocr_done")} onRetry={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("processing-step-upload")).toHaveAttribute(
      "data-state",
      "done",
    );
    expect(screen.getByTestId("processing-step-ocr")).toHaveAttribute(
      "data-state",
      "done",
    );
    expect(screen.getByTestId("processing-step-analysis")).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("marks all steps done once analyzed", () => {
    render(
      <ScanProcessingStep doc={makeDoc("analyzed")} onRetry={vi.fn()} onClose={vi.fn()} />,
    );

    for (const key of ["upload", "ocr", "analysis"]) {
      expect(screen.getByTestId(`processing-step-${key}`)).toHaveAttribute(
        "data-state",
        "done",
      );
    }
  });

  it("shows an error state with a retry action for an upload-stage failure", () => {
    const onRetry = vi.fn();
    render(
      <ScanProcessingStep
        doc={null}
        uploadError="Netzwerkfehler."
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText((_, el) => el?.textContent === "Netzwerkfehler. Bitte nochmal versuchen."),
    ).toBeDefined();
    fireEvent.click(screen.getByTestId("processing-retry-button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an error state for a document that failed server-side", () => {
    render(
      <ScanProcessingStep
        doc={makeDoc("failed", { error_message: "OCR fehlgeschlagen." })}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /das hat nicht geklappt/i }),
    ).toBeDefined();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <ScanProcessingStep doc={null} onRetry={vi.fn()} onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText(/schließen/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose from the 'Im Hintergrund weiterlaufen' button", () => {
    const onClose = vi.fn();
    render(
      <ScanProcessingStep doc={null} onRetry={vi.fn()} onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId("processing-background-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
