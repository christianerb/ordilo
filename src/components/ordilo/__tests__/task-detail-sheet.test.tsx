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
  priority: "medium",
  status: "open",
  confidence: 1,
  confirmed: true,
  created_at: "2026-07-23T08:00:00Z",
  tags: [],
  assigned_to: null,
};

function renderSheet(overrides: Partial<TaskCardData> = {}) {
  render(
    <TaskDetailSheet
      task={{ ...task, ...overrides }}
      open
      onOpenChange={vi.fn()}
      onSaved={vi.fn()}
      onToggleDone={vi.fn()}
      onDismiss={vi.fn()}
      members={[
        { id: "member-1", name: "Christian", role: null },
        { id: "member-2", name: "Hanna", role: null },
      ]}
    />,
  );
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
    expect(screen.getByText("Priorität")).toBeInTheDocument();
    expect(screen.getByText("Verantwortlich")).toBeInTheDocument();
    expect(screen.getByText("Nicht festgelegt")).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText("Aufgabentitel"), {
      target: { value: "Neue Aufgabe" },
    });

    expect(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Als erledigt markieren" }),
    ).not.toBeInTheDocument();
  });
});
