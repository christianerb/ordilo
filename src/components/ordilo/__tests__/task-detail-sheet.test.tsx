import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: vi.fn() }),
}));

vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({ openDocument: vi.fn() }),
}));

import { TaskDetailSheet } from "@/components/ordilo/task-detail-sheet";
import type { TaskCardData } from "@/components/ordilo/task-card";

const task: TaskCardData = {
  id: "task-1",
  family_id: "family-1",
  document_id: null,
  title: "Klassenfahrt bezahlen",
  description: null,
  due_date: null,
  status: "open",
  confidence: 1,
  confirmed: true,
  created_at: "2026-07-23T08:00:00Z",
  tags: [],
  assigned_to: null,
  completed_at: null,
};

const members = [
  { id: "member-1", name: "Christian", role: null },
  { id: "member-2", name: "Hanna", role: null },
];

function renderSheet(
  overrides: Partial<TaskCardData> = {},
  props: Partial<React.ComponentProps<typeof TaskDetailSheet>> = {},
) {
  const resolved: React.ComponentProps<typeof TaskDetailSheet> = {
    task: { ...task, ...overrides },
    open: true,
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
    onToggleDone: vi.fn(),
    onDismiss: vi.fn(),
    members,
    ...props,
  };
  render(<TaskDetailSheet {...resolved} />);
  return resolved;
}

describe("TaskDetailSheet", () => {
  it("shows useful task metadata without exposing AI confidence", () => {
    renderSheet();

    expect(screen.getByText("Offen")).toBeInTheDocument();
    expect(screen.queryByText("Erstellt am 23.07.2026")).not.toBeInTheDocument();
    expect(screen.queryByText(/% KI/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Weitere Angaben"));
    expect(screen.getByText("Erstellt am 23.07.2026")).toBeInTheDocument();
  });

  it("keeps optional keywords behind progressive disclosure", () => {
    renderSheet();

    expect(screen.getByText("Fällig am")).toBeInTheDocument();
    expect(screen.getByText("Wer macht das?")).toBeInTheDocument();
    expect(screen.getByText("Niemand")).toBeInTheDocument();
    expect(screen.queryByText("Stichwörter")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Weitere Angaben"));
    expect(screen.getByText("Stichwörter")).toBeInTheDocument();
  });

  it("uses an action label for completing the task", () => {
    renderSheet();

    expect(
      screen.getByRole("button", { name: "Als erledigt markieren" }),
    ).toBeInTheDocument();
  });

  it("prioritizes saving after a field changes", () => {
    renderSheet();

    fireEvent.change(screen.getByTestId("task-detail-title"), {
      target: { value: "Neue Aufgabe" },
    });

    expect(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Als erledigt markieren" }),
    ).not.toBeInTheDocument();
  });

  it("rejects changing a due date to the past", () => {
    renderSheet();

    fireEvent.change(screen.getByTestId("task-detail-due-date"), {
      target: { value: "01.01.2000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    );

    expect(
      screen.getByText("Bitte wähle heute oder einen späteren Tag."),
    ).toBeInTheDocument();
  });

  it("picks who does it with faces, not a native dropdown", () => {
    renderSheet();

    fireEvent.click(screen.getByTestId("task-detail-assignee-member-2"));
    expect(
      screen
        .getByTestId("task-detail-assignee-member-2")
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    ).toBeInTheDocument();
  });

  it("offers quick days that fill the date field", () => {
    renderSheet();

    fireEvent.click(screen.getByTestId("task-detail-due-today"));

    const today = new Date();
    const expected = [
      String(today.getDate()).padStart(2, "0"),
      String(today.getMonth() + 1).padStart(2, "0"),
      today.getFullYear(),
    ].join(".");
    expect(
      (screen.getByTestId("task-detail-due-date") as HTMLInputElement).value,
    ).toBe(expected);
  });

  it("closes straight away when nothing was changed", () => {
    const props = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId("task-detail-discard-dialog")).toBeNull();
  });

  it("does not drop typed work on the floor when closing", () => {
    // Every other action on this screen either commits at once or offers an
    // undo; silently losing a half-typed title has neither.
    const props = renderSheet();

    fireEvent.change(screen.getByTestId("task-detail-title"), {
      target: { value: "Klassenfahrt überweisen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId("task-detail-discard-dialog")).toBeInTheDocument();
  });

  it("can go back to editing from the guard", () => {
    renderSheet();

    fireEvent.change(screen.getByTestId("task-detail-title"), {
      target: { value: "Geändert" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(screen.getByTestId("task-detail-keep-editing"));

    expect(screen.queryByTestId("task-detail-discard-dialog")).toBeNull();
    expect(
      (screen.getByTestId("task-detail-title") as HTMLInputElement).value,
    ).toBe("Geändert");
  });

  it("can throw the changes away on purpose", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByTestId("task-detail-title"), {
      target: { value: "Geändert" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(screen.getByTestId("task-detail-discard"));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
