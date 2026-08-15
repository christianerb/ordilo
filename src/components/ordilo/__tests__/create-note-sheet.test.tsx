import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateNoteSheet } from "@/components/ordilo/create-note-sheet";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/schemas/extraction";

function renderSheet(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn();
  render(
    <CreateNoteSheet open onOpenChange={onOpenChange} onSubmit={onSubmit} />,
  );
  return { onSubmit, onOpenChange };
}

describe("CreateNoteSheet", () => {
  it("offers the document type as a dropdown with every type", () => {
    renderSheet();

    const select = screen.getByTestId("note-type-select") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    // All nine types, in schema order, with their German labels.
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      ...DOCUMENT_TYPES,
    ]);
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(
      DOCUMENT_TYPES.map((type) => DOCUMENT_TYPE_LABELS[type]),
    );
  });

  it("submits the type picked from the dropdown", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.change(screen.getByTestId("note-title-input"), {
      target: { value: "Steuer ID Hanna" },
    });
    fireEvent.change(screen.getByTestId("note-editor-textarea"), {
      target: { value: "74 031 832 353" },
    });
    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "tax" },
    });
    fireEvent.click(screen.getByTestId("note-submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Steuer ID Hanna",
      content: "74 031 832 353",
      documentType: "tax",
    });
  });

  it("closes as soon as the submit handler resolves", async () => {
    const { onOpenChange } = renderSheet();

    fireEvent.change(screen.getByTestId("note-title-input"), {
      target: { value: "Notiz" },
    });
    fireEvent.change(screen.getByTestId("note-editor-textarea"), {
      target: { value: "Inhalt" },
    });
    fireEvent.click(screen.getByTestId("note-submit-button"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
