import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TaskCard } from "@/components/ordilo/task-card";
import type { TaskCardData } from "@/components/ordilo/task-card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: "doc-1",
    title: "Rechnung bezahlen",
    due_date: "2026-07-15",
    priority: "high",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    document_title: "Stromrechnung Juli",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskCard", () => {
  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  it("renders the task title", () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.getByText("Rechnung bezahlen")).toBeDefined();
  });

  it("renders the due date in German format (DD.MM.YYYY)", () => {
    render(<TaskCard task={makeTask({ due_date: "2026-07-15" })} />);
    expect(screen.getByText(/15\.07\.2026/)).toBeDefined();
  });

  it("does not render a due date label when due_date is null", () => {
    render(<TaskCard task={makeTask({ due_date: null })} />);
    expect(screen.queryByText(/Fällig/)).toBeNull();
  });

  it("renders a priority badge with German label", () => {
    render(<TaskCard task={makeTask({ priority: "high" })} />);
    expect(screen.getByText("Hoch")).toBeDefined();
  });

  it("renders 'Mittel' for medium priority", () => {
    render(<TaskCard task={makeTask({ priority: "medium" })} />);
    expect(screen.getByText("Mittel")).toBeDefined();
  });

  it("renders 'Niedrig' for low priority", () => {
    render(<TaskCard task={makeTask({ priority: "low" })} />);
    expect(screen.getByText("Niedrig")).toBeDefined();
  });

  it("applies different visual classes for high vs low priority", () => {
    const { rerender } = render(<TaskCard task={makeTask({ priority: "high" })} />);
    const highBadge = screen.getByTestId("priority-badge");
    const highClasses = highBadge.className;

    rerender(<TaskCard task={makeTask({ priority: "low" })} />);
    const lowBadge = screen.getByTestId("priority-badge");
    const lowClasses = lowBadge.className;

    expect(highClasses).not.toBe(lowClasses);
  });

  // ---------------------------------------------------------------------------
  // Checkbox / done state
  // ---------------------------------------------------------------------------

  it("renders a checkbox that is unchecked for open tasks", () => {
    render(<TaskCard task={makeTask({ status: "open" })} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
  });

  it("renders a checkbox that is checked for done tasks", () => {
    render(<TaskCard task={makeTask({ status: "done" })} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
  });

  it("calls onToggleDone when the checkbox is clicked", () => {
    const onToggleDone = vi.fn();
    render(<TaskCard task={makeTask()} onToggleDone={onToggleDone} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleDone).toHaveBeenCalledTimes(1);
  });

  it("applies strikethrough styling to the title when task is done", () => {
    render(<TaskCard task={makeTask({ status: "done" })} />);
    const title = screen.getByText("Rechnung bezahlen");
    expect(title.className).toContain("line-through");
  });

  it("does not apply strikethrough styling when task is open", () => {
    render(<TaskCard task={makeTask({ status: "open" })} />);
    const title = screen.getByText("Rechnung bezahlen");
    expect(title.className).not.toContain("line-through");
  });

  // ---------------------------------------------------------------------------
  // Dismiss action
  // ---------------------------------------------------------------------------

  it("renders a dismiss button for open tasks", () => {
    render(<TaskCard task={makeTask({ status: "open" })} onDismiss={vi.fn()} />);
    expect(screen.getByLabelText(/verwerfen/i)).toBeDefined();
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<TaskCard task={makeTask()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText(/verwerfen/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render a dismiss button when onDismiss is not provided", () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.queryByLabelText(/verwerfen/i)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Source document link
  // ---------------------------------------------------------------------------

  it("renders a link to the source document when document_id is present", () => {
    render(
      <TaskCard
        task={makeTask({ document_id: "doc-1", document_title: "Stromrechnung" })}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("/scan");
    expect(link.getAttribute("href")).toContain("doc-1");
  });

  it("does not render a document link when document_id is null", () => {
    render(<TaskCard task={makeTask({ document_id: null })} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the document title in the link when available", () => {
    render(
      <TaskCard
        task={makeTask({ document_title: "Stromrechnung Juli" })}
      />,
    );
    expect(screen.getByText(/Stromrechnung Juli/)).toBeDefined();
  });

  it("shows a fallback label when document title is null", () => {
    render(
      <TaskCard
        task={makeTask({ document_title: null })}
      />,
    );
    // Should show a generic "Zum Dokument" label
    expect(screen.getByText(/Zum Dokument/i)).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Done state interactions
  // ---------------------------------------------------------------------------

  it("calls onToggleDone with done when toggling an open task", () => {
    const onToggleDone = vi.fn();
    render(
      <TaskCard
        task={makeTask({ status: "open" })}
        onToggleDone={onToggleDone}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleDone).toHaveBeenCalledWith("done");
  });

  it("calls onToggleDone with open when toggling a done task (reopen)", () => {
    const onToggleDone = vi.fn();
    render(
      <TaskCard
        task={makeTask({ status: "done" })}
        onToggleDone={onToggleDone}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleDone).toHaveBeenCalledWith("open");
  });

  // ---------------------------------------------------------------------------
  // Snapshot / data attributes
  // ---------------------------------------------------------------------------

  it("has data-testid='task-card'", () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.getByTestId("task-card")).toBeDefined();
  });

  it("has data-status attribute matching the task status", () => {
    render(<TaskCard task={makeTask({ status: "open" })} />);
    expect(screen.getByTestId("task-card").getAttribute("data-status")).toBe(
      "open",
    );
  });

  it("has data-priority attribute matching the task priority", () => {
    render(<TaskCard task={makeTask({ priority: "high" })} />);
    expect(
      screen.getByTestId("task-card").getAttribute("data-priority"),
    ).toBe("high");
  });
});
