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
    // Every type, in schema order, with its German label.
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

  it("hides the login fields until the type is Zugangsdaten", () => {
    renderSheet();

    expect(screen.queryByTestId("note-credentials-fields")).toBeNull();
    expect(screen.queryByTestId("note-url-input")).toBeNull();
    expect(screen.queryByTestId("note-username-input")).toBeNull();
    expect(screen.queryByTestId("note-secret-input")).toBeNull();

    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "credentials" },
    });

    expect(screen.getByTestId("note-url-input")).toBeInTheDocument();
    expect(screen.getByTestId("note-username-input")).toBeInTheDocument();
    expect(screen.getByTestId("note-secret-input")).toBeInTheDocument();
  });

  it("renames the free-text fields for a Zugangsdaten note", () => {
    renderSheet();

    // Scoped to <label>: "Notiz" is also one of the type dropdown options.
    const label = (text: string) =>
      screen.queryByText(text, { selector: "label" });

    expect(label("Titel")).toBeInTheDocument();
    expect(label("Notiz")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "credentials" },
    });

    expect(label("Name")).toBeInTheDocument();
    expect(label("Beschreibung")).toBeInTheDocument();
    expect(label("Titel")).toBeNull();
    expect(label("Notiz")).toBeNull();
  });

  it("folds URL and user name into the body, password stays separate", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "credentials" },
    });
    fireEvent.change(screen.getByTestId("note-title-input"), {
      target: { value: "Netflix" },
    });
    fireEvent.change(screen.getByTestId("note-url-input"), {
      target: { value: "https://www.netflix.com" },
    });
    fireEvent.change(screen.getByTestId("note-username-input"), {
      target: { value: "familie@example.de" },
    });
    fireEvent.change(screen.getByTestId("note-secret-input"), {
      target: { value: "hunter2" },
    });
    fireEvent.change(screen.getByTestId("note-editor-textarea"), {
      target: { value: "Familienaccount, vier Profile" },
    });
    fireEvent.click(screen.getByTestId("note-submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Netflix",
      documentType: "credentials",
      secret: "hunter2",
      content:
        "- **URL:** https://www.netflix.com\n" +
        "- **Benutzername:** familie@example.de\n\n" +
        "Familienaccount, vier Profile",
    });
    expect(onSubmit.mock.calls[0][0].content).not.toContain("hunter2");
  });

  it("saves a Zugangsdaten note that only has a name and a password", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "credentials" },
    });
    fireEvent.change(screen.getByTestId("note-title-input"), {
      target: { value: "WLAN" },
    });
    fireEvent.change(screen.getByTestId("note-secret-input"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByTestId("note-submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    // The API rejects an empty body, so the name carries it.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      content: "Zugangsdaten WLAN",
      secret: "hunter2",
    });
  });

  it("keeps a Zugangsdaten note with nothing but a name unsubmittable", () => {
    renderSheet();

    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "credentials" },
    });
    fireEvent.change(screen.getByTestId("note-title-input"), {
      target: { value: "WLAN" },
    });

    expect(screen.getByTestId("note-submit-button")).toBeDisabled();
  });

  it("drops URL, user name and password when the type moves away", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "credentials" },
    });
    fireEvent.change(screen.getByTestId("note-title-input"), {
      target: { value: "WLAN" },
    });
    fireEvent.change(screen.getByTestId("note-url-input"), {
      target: { value: "https://router.local" },
    });
    fireEvent.change(screen.getByTestId("note-username-input"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByTestId("note-secret-input"), {
      target: { value: "hunter2" },
    });
    // The description survives the switch — it is the same free text every
    // other type writes.
    fireEvent.change(screen.getByTestId("note-editor-textarea"), {
      target: { value: "Gastzugang im Flur" },
    });
    fireEvent.change(screen.getByTestId("note-type-select"), {
      target: { value: "note" },
    });
    fireEvent.click(screen.getByTestId("note-submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        documentType: "note",
        content: "Gastzugang im Flur",
        secret: "",
      }),
    );
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
