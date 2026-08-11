import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

// Mock next/navigation useRouter
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock @/lib/supabase/client — backs useTaskMutation's `tasks` updates.
const mockUpdate = vi.fn();
const mockEq = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  }),
}));

// Mock the scan context hooks (useScanActions for the empty-state CTA,
// useDocumentViewer used inside TaskCard).
vi.mock("@/lib/scan/scan-context", () => ({
  useScanActions: () => ({ openWizard: vi.fn() }),
  useDocumentViewer: () => ({ openDocument: vi.fn() }),
}));

// The detail/create sheets are irrelevant for board interactions.
vi.mock("@/components/ordilo/task-detail-sheet", () => ({
  TaskDetailSheet: () => null,
}));
vi.mock("@/components/ordilo/task-create-sheet", () => ({
  TaskCreateSheet: () => null,
}));

// Mock sonner so we can assert on toast calls (incl. the undo action).
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { AufgabenClient } from "@/app/(app)/aufgaben/aufgaben-client";
import type { TaskCardData } from "@/components/ordilo/task-card";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const members = [{ id: "m1", name: "Christian", role: "Vater" }];

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: null,
    title: "Schulsachen",
    description: null,
    due_date: null, // lands in the "Später" column
    priority: "medium",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-08-01T00:00:00Z",
    tags: [],
    assigned_to: null,
    ...overrides,
  };
}

function renderBoard(tasks: TaskCardData[] = [makeTask()]) {
  return render(
    <AufgabenClient
      initialTasks={tasks}
      members={members}
      familyId="fam-1"
    />,
  );
}

/** Minimal DataTransfer stand-in for jsdom drag events. */
function makeDataTransfer() {
  const data: Record<string, string> = {};
  return {
    setData: (type: string, val: string) => {
      data[type] = val;
    },
    getData: (type: string) => data[type] ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

function getDraggableCard(): HTMLElement {
  return screen.getByTestId("task-card").closest("[draggable]") as HTMLElement;
}

/** Start an HTML5 drag on the first task card and hover a target column. */
function dragCardOverColumn(columnId: string) {
  const dataTransfer = makeDataTransfer();
  fireEvent.dragStart(getDraggableCard(), { dataTransfer });
  const column = screen.getByTestId(`board-column-${columnId}`);
  fireEvent.dragEnter(column, { dataTransfer });
  fireEvent.dragOver(column, { dataTransfer });
  return { dataTransfer, column };
}

const TODAY_STR = new Date().toISOString().split("T")[0];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

/**
 * In-memory localStorage stub — the test environment's built-in
 * `window.localStorage` lacks working methods (Node webstorage global
 * without a backing file), so tests replace it with a real store.
 */
function makeLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

let localStorageMock: ReturnType<typeof makeLocalStorageMock>;

beforeEach(() => {
  mockUpdate.mockClear();
  mockEq.mockClear();
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  localStorageMock = makeLocalStorageMock();
  vi.stubGlobal("localStorage", localStorageMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AufgabenClient — board drag-and-drop", () => {
  it("reschedules the due date when a task is dropped on another column", async () => {
    renderBoard();
    const { dataTransfer, column } = dragCardOverColumn("this-week");

    fireEvent.drop(column, { dataTransfer });

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "task-1"));
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "open",
      due_date: TODAY_STR,
    });
    expect(column).toHaveClass("animate-board-settle");
  });

  it("shows a success toast with an undo action that reverts the drop", async () => {
    renderBoard();
    const { dataTransfer, column } = dragCardOverColumn("this-week");

    fireEvent.drop(column, { dataTransfer });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [message, options] = vi.mocked(toast.success).mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Für diese Woche eingeplant");
    expect(options.action.label).toBe("Rückgängig");

    // Undo restores the previous values (open, no due date → "Später").
    await act(async () => {
      options.action.onClick();
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][0]).toEqual({
      status: "open",
      due_date: null,
    });
  });

  it("shows a drop placeholder in the hovered target column", () => {
    renderBoard();
    dragCardOverColumn("this-week");

    expect(screen.getByTestId("drop-placeholder-this-week")).toBeDefined();
    // The task's own column is not a valid target — no placeholder there.
    expect(screen.queryByTestId("drop-placeholder-later")).toBeNull();
  });

  it("does nothing when a task is dropped back onto its own column", () => {
    renderBoard();
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(getDraggableCard(), { dataTransfer });
    const ownColumn = screen.getByTestId("board-column-later");
    // canAcceptDrop is false for the own column, so the drop handler bails.
    fireEvent.drop(ownColumn, { dataTransfer });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("AufgabenClient — drag hint", () => {
  it("shows the hint on first visit and hides it after dismiss", () => {
    renderBoard();

    const hint = screen.getByTestId("board-drag-hint");
    expect(hint.textContent).toContain("Tipp");

    fireEvent.click(screen.getByLabelText("Hinweis schließen"));
    expect(screen.queryByTestId("board-drag-hint")).toBeNull();
    expect(
      localStorageMock.getItem("ordilo-board-drag-hint-v1"),
    ).toBeTruthy();
  });

  it("stays hidden once dismissed in a previous visit", () => {
    localStorageMock.setItem("ordilo-board-drag-hint-v1", "dismissed");
    renderBoard();

    expect(screen.queryByTestId("board-drag-hint")).toBeNull();
  });
});

describe("AufgabenClient — delete confirmation", () => {
  it("uses a bounded dialog instead of a full-width bottom sheet", async () => {
    renderBoard();

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-delete"));

    const dialog = await screen.findByTestId("task-delete-confirm-dialog");
    expect(dialog.className).toContain("max-w-sm");
    expect(screen.queryByTestId("task-delete-confirm-sheet")).toBeNull();
  });

  it("offers an undo action after dismissing a task", async () => {
    renderBoard();

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-delete"));
    fireEvent.click(screen.getByTestId("confirm-delete-task-button"));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [message, options] = vi.mocked(toast.success).mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Verworfen");
    expect(options.action.label).toBe("Rückgängig");

    await act(async () => {
      options.action.onClick();
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][0]).toEqual({
      status: "open",
      due_date: null,
    });
  });
});
