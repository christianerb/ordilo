import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockOpenDocument = vi.fn();
vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({
    openDocument: mockOpenDocument,
  }),
}));

import { TaskCard } from "@/components/ordilo/task-card";
import type { TaskCardData } from "@/components/ordilo/task-card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * An ISO date `days` from today. The card reads the real clock (a task is
 * overdue relative to *now*), so fixtures have to move with it — a
 * hard-coded date silently changes meaning as time passes.
 */
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE");
}

/** The same date in the German form the card puts in its `title`. */
function germanDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: "doc-1",
    title: "Rechnung bezahlen",
    description: null,
    due_date: isoInDays(30),
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    tags: [],
    document_title: "Stromrechnung Juli",
    assigned_to: null,
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

  it("renders a short, human due label with the full date as its title", () => {
    const due_date = isoInDays(30);
    render(<TaskCard task={makeTask({ due_date })} />);
    const due = screen.getByTestId("task-due-date");
    // Far enough out for the plain date form ("14. Sep.").
    expect(due.textContent).toMatch(/\d{1,2}\.\s\S+/);
    expect(due.getAttribute("title")).toBe(germanDate(due_date));
  });

  it("says how late an overdue task is instead of naming the day", () => {
    const due_date = isoInDays(-3);
    render(<TaskCard task={makeTask({ due_date })} />);
    const due = screen.getByTestId("task-due-date");
    // "seit 3 Tagen" is what the family needs; the exact day stays in the
    // title attribute rather than taking up the row.
    expect(due.textContent).toContain("seit 3 Tagen");
    expect(due.getAttribute("title")).toBe(germanDate(due_date));
  });

  it("drops the overdue label once the task is done", () => {
    render(
      <TaskCard task={makeTask({ due_date: isoInDays(-3), status: "done" })} />,
    );
    expect(screen.getByTestId("task-due-date").textContent).not.toContain(
      "seit",
    );
  });

  it("says 'Heute' for a task due today", () => {
    const today = new Date().toLocaleDateString("sv-SE");
    render(<TaskCard task={makeTask({ due_date: today })} />);
    expect(screen.getByTestId("task-due-date").textContent).toContain("Heute");
  });

  it("does not render a due date label when due_date is null", () => {
    render(<TaskCard task={makeTask({ due_date: null })} />);
    expect(screen.queryByText(/Fällig/)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Checkbox / done state
  // ---------------------------------------------------------------------------

  it("renders a checkbox that is unchecked for open tasks", () => {
    render(<TaskCard task={makeTask({ status: "open" })} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(checkbox.className).toContain("size-11");
    expect(checkbox.querySelector("span")?.className).toContain("size-6");
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

  it("renders an actions menu for open tasks", () => {
    render(<TaskCard task={makeTask({ status: "open" })} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("task-card-actions")).toBeDefined();
  });

  it("calls onDismiss when the delete menu item is clicked", async () => {
    const onDismiss = vi.fn();
    render(<TaskCard task={makeTask()} onDismiss={onDismiss} />);
    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    const deleteItem = await screen.findByTestId("card-action-delete");
    fireEvent.click(deleteItem);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render an actions menu when onDismiss is not provided", () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.queryByTestId("task-card-actions")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Assignee — "wer macht was"
  // ---------------------------------------------------------------------------

  it("offers an empty slot to assign a task nobody has taken on", () => {
    const onAssign = vi.fn();
    render(
      <TaskCard task={makeTask({ assigned_to: null })} onAssign={onAssign} />,
    );

    const slot = screen.getByTestId("task-assignee");
    expect(slot.getAttribute("aria-label")).toContain("Niemand zuständig");
    fireEvent.click(slot);
    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it("shows the assignee's face and lets it be reassigned in one tap", () => {
    const onAssign = vi.fn();
    render(
      <TaskCard
        task={makeTask({ assigned_to: "m1" })}
        assignee={{ name: "Karina" }}
        onAssign={onAssign}
      />,
    );

    const slot = screen.getByTestId("task-assignee");
    expect(slot.getAttribute("aria-label")).toContain("Karina");
    fireEvent.click(slot);
    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it("does not swallow the row's own click when the face is tapped", () => {
    const onClick = vi.fn();
    const onAssign = vi.fn();
    render(
      <TaskCard
        task={makeTask({ assigned_to: "m1" })}
        assignee={{ name: "Karina" }}
        onAssign={onAssign}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByTestId("task-assignee"));
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a plain face where reassigning is not offered", () => {
    render(
      <TaskCard
        task={makeTask({ assigned_to: "m1" })}
        assignee={{ name: "Karina" }}
      />,
    );

    const slot = screen.getByTestId("task-assignee");
    expect(slot.tagName).not.toBe("BUTTON");
    expect(slot.textContent).toContain("Karina");
  });

  it("shows no assignee slot at all for an unassigned read-only card", () => {
    render(<TaskCard task={makeTask({ assigned_to: null })} />);
    expect(screen.queryByTestId("task-assignee")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Row menu
  // ---------------------------------------------------------------------------

  it("offers Verschieben in the menu, so the swipe is not the only way", async () => {
    const onSchedule = vi.fn();
    render(
      <TaskCard
        task={makeTask({ status: "open" })}
        onSchedule={onSchedule}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-schedule"));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it("does not offer Verschieben for a task that is already done", async () => {
    render(
      <TaskCard
        task={makeTask({ status: "done" })}
        onSchedule={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    await screen.findByTestId("card-action-delete");
    expect(screen.queryByTestId("card-action-schedule")).toBeNull();
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
    expect(link.getAttribute("href")).toContain("/dokumente");
    expect(link.getAttribute("href")).toContain("doc-1");
  });

  it("opens the shared document sheet instead of navigating away", () => {
    render(<TaskCard task={makeTask({ document_id: "doc-7" })} />);
    fireEvent.click(screen.getByTestId("task-document-link"));
    expect(mockOpenDocument).toHaveBeenCalledWith("doc-7");
  });

  it("does not render a document link when document_id is null", () => {
    render(<TaskCard task={makeTask({ document_id: null })} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the document title in the meta row when available", () => {
    render(
      <TaskCard
        task={makeTask({ document_title: "Stromrechnung Juli" })}
      />,
    );
    // Document title appears in both meta row and sr-only link
    const matches = screen.getAllByText(/Stromrechnung Juli/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
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

  // ---------------------------------------------------------------------------
  // Confidence badge (removed from compact card — shown in detail sheet only)
  // ---------------------------------------------------------------------------

  it("does not render a confidence badge in the compact card", () => {
    render(<TaskCard task={makeTask({ confidence: 0.92 })} />);
    expect(screen.queryByTestId("task-confidence-badge")).toBeNull();
  });
});
