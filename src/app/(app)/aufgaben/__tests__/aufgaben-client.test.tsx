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

// The detail/create sheets are irrelevant for board interactions — the
// detail sheet mock only records whether it would be open (deep links).
vi.mock("@/components/ordilo/task-detail-sheet", () => ({
  TaskDetailSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="task-detail-sheet-open" /> : null,
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

const members = [
  { id: "m1", name: "Christian", role: "Vater" },
  { id: "m2", name: "Karina", role: "Mutter" },
];

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: null,
    title: "Schulsachen",
    description: null,
    due_date: null, // lands in the "Später" column
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-08-01T00:00:00Z",
    tags: [],
    assigned_to: null,
    ...overrides,
  };
}

function renderBoard(
  tasks: TaskCardData[] = [makeTask()],
  openTaskId?: string,
) {
  return render(
    <AufgabenClient
      initialTasks={tasks}
      members={members}
      familyId="fam-1"
      openTaskId={openTaskId}
    />,
  );
}

function groupTitles(groupId: string): string[] {
  const group = screen.getByTestId(`board-column-${groupId}`);
  return Array.from(group.querySelectorAll("[data-testid='task-title']")).map(
    (node) => node.textContent ?? "",
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
const TOMORROW_STR = new Date(Date.now() + 86_400_000)
  .toISOString()
  .split("T")[0];
const YESTERDAY_STR = new Date(Date.now() - 86_400_000)
  .toISOString()
  .split("T")[0];

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

describe("AufgabenClient — deep link", () => {
  it("opens the detail sheet for ?task=<id>", () => {
    renderBoard([makeTask()], "task-1");
    expect(screen.getByTestId("task-detail-sheet-open")).toBeDefined();
  });

  it("stays closed when the id matches no task", () => {
    renderBoard([makeTask()], "task-unknown");
    expect(screen.queryByTestId("task-detail-sheet-open")).toBeNull();
  });

  it("stays closed without a deep link", () => {
    renderBoard([makeTask()]);
    expect(screen.queryByTestId("task-detail-sheet-open")).toBeNull();
  });
});

describe("AufgabenClient — board drag-and-drop", () => {
  it("reschedules the due date when a task is dropped on another group", async () => {
    renderBoard();
    const { dataTransfer, column } = dragCardOverColumn("today");

    fireEvent.drop(column, { dataTransfer });

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "task-1"));
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "open",
      due_date: TODAY_STR,
    });
    expect(column).toHaveClass("animate-board-settle");
  });

  it("schedules for tomorrow when dropped on 'Diese Woche'", async () => {
    renderBoard();
    const { dataTransfer, column } = dragCardOverColumn("this-week");

    fireEvent.drop(column, { dataTransfer });

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "task-1"));
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "open",
      due_date: TOMORROW_STR,
    });
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

describe("AufgabenClient — grouped list", () => {
  it("splits tasks into überfällig, heute, diese Woche and später", () => {
    renderBoard([
      makeTask({ id: "t1", title: "Überfällig", due_date: YESTERDAY_STR }),
      makeTask({ id: "t2", title: "Heute fällig", due_date: TODAY_STR }),
      makeTask({ id: "t3", title: "Diese Woche", due_date: TOMORROW_STR }),
      makeTask({ id: "t4", title: "Irgendwann", due_date: null }),
    ]);

    expect(groupTitles("overdue")).toEqual(["Überfällig"]);
    expect(groupTitles("today")).toEqual(["Heute fällig"]);
    expect(groupTitles("this-week")).toEqual(["Diese Woche"]);
    expect(groupTitles("later")).toEqual(["Irgendwann"]);
  });

  it("hides a group that has nothing in it", () => {
    renderBoard([makeTask({ due_date: TODAY_STR })]);
    expect(screen.queryByTestId("board-column-overdue")).toBeNull();
    expect(screen.getByTestId("board-column-today")).toBeDefined();
  });

  it("peeks at 'Später' and expands the rest on demand", () => {
    renderBoard(
      Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: `t${i}`, title: `Aufgabe ${i}`, due_date: null }),
      ),
    );

    expect(groupTitles("later")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("board-column-expand-later"));
    expect(groupTitles("later")).toHaveLength(5);
  });

  it("keeps done tasks collapsed until the group is opened", () => {
    renderBoard([
      makeTask({ id: "t1", title: "Erledigtes", status: "done" }),
      makeTask({ id: "t2", title: "Offenes", due_date: TODAY_STR }),
    ]);

    expect(groupTitles("done")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("board-column-header-done"));
    expect(groupTitles("done")).toEqual(["Erledigtes"]);
  });

  it("filters the list to one family member and back", () => {
    renderBoard([
      makeTask({ id: "t1", title: "Christians Aufgabe", due_date: TODAY_STR, assigned_to: "m1" }),
      makeTask({ id: "t2", title: "Karinas Aufgabe", due_date: TODAY_STR, assigned_to: "m2" }),
    ]);

    fireEvent.click(screen.getByTestId("task-chip-m2"));
    expect(groupTitles("today")).toEqual(["Karinas Aufgabe"]);

    fireEvent.click(screen.getByTestId("task-chip-all"));
    expect(groupTitles("today")).toHaveLength(2);
  });

  it("says so when a filter leaves nothing to show", () => {
    renderBoard([
      makeTask({ id: "t1", due_date: TODAY_STR, assigned_to: "m1" }),
    ]);

    fireEvent.click(screen.getByTestId("task-chip-m2"));
    expect(screen.getByTestId("task-filter-empty")).toBeDefined();
  });

  it("finds tasks nobody has taken on yet", () => {
    renderBoard([
      makeTask({ id: "t1", title: "Zugewiesen", due_date: TODAY_STR, assigned_to: "m1" }),
      makeTask({ id: "t2", title: "Herrenlos", due_date: TODAY_STR }),
    ]);

    fireEvent.click(screen.getByTestId("task-more-filters"));
    fireEvent.click(screen.getByTestId("task-filter-unassigned"));
    expect(groupTitles("today")).toEqual(["Herrenlos"]);
  });
});
