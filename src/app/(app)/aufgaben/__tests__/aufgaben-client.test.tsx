import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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

// The detail/create sheets are irrelevant for list interactions — the
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
    due_date: null, // lands in "Ohne Termin"
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-08-01T00:00:00Z",
    tags: [],
    assigned_to: null,
    ...overrides,
  };
}

function renderList(tasks: TaskCardData[] = [makeTask()], openTaskId?: string) {
  return render(
    <AufgabenClient
      initialTasks={tasks}
      members={members}
      familyId="fam-1"
      openTaskId={openTaskId}
    />,
  );
}

function sectionTitles(sectionId: string): string[] {
  const section = screen.getByTestId(`task-section-${sectionId}`);
  return Array.from(
    section.querySelectorAll("[data-testid='task-title']"),
  ).map((node) => node.textContent ?? "");
}

/** An ISO date `days` from today, in the user's own calendar day. */
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE");
}

const TODAY_STR = isoInDays(0);
const TOMORROW_STR = isoInDays(1);
const YESTERDAY_STR = isoInDays(-1);

/** Read back the single toast that a committed action produced. */
function lastToast(): [string, { action?: { label: string; onClick: () => void } }] {
  const calls = vi.mocked(toast.success).mock.calls;
  return calls[calls.length - 1] as [
    string,
    { action?: { label: string; onClick: () => void } },
  ];
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUpdate.mockClear();
  mockEq.mockClear();
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
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
    renderList([makeTask()], "task-1");
    expect(screen.getByTestId("task-detail-sheet-open")).toBeDefined();
  });

  it("stays closed when the id matches no task", () => {
    renderList([makeTask()], "task-unknown");
    expect(screen.queryByTestId("task-detail-sheet-open")).toBeNull();
  });

  it("stays closed without a deep link", () => {
    renderList([makeTask()]);
    expect(screen.queryByTestId("task-detail-sheet-open")).toBeNull();
  });
});

describe("AufgabenClient — sections", () => {
  it("splits tasks into jetzt dran, als Nächstes and ohne Termin", () => {
    renderList([
      makeTask({ id: "t1", title: "Überfällig", due_date: YESTERDAY_STR }),
      makeTask({ id: "t2", title: "Heute fällig", due_date: TODAY_STR }),
      makeTask({ id: "t3", title: "Morgen", due_date: TOMORROW_STR }),
      makeTask({ id: "t4", title: "Irgendwann", due_date: null }),
    ]);

    // Overdue and today share one section — an overdue task is today's work.
    expect(sectionTitles("now")).toEqual(["Überfällig", "Heute fällig"]);
    expect(sectionTitles("next")).toEqual(["Morgen"]);
    expect(sectionTitles("undated")).toEqual(["Irgendwann"]);
  });

  it("keeps far-future tasks in 'Als Nächstes' rather than hiding them", () => {
    renderList([
      makeTask({ id: "t1", title: "In drei Wochen", due_date: isoInDays(21) }),
    ]);
    expect(sectionTitles("next")).toEqual(["In drei Wochen"]);
  });

  it("hides a section that has nothing in it", () => {
    renderList([makeTask({ due_date: TODAY_STR })]);
    expect(screen.queryByTestId("task-section-undated")).toBeNull();
    expect(screen.getByTestId("task-section-now")).toBeDefined();
  });

  it("says so when today is clear but work remains", () => {
    renderList([makeTask({ due_date: TOMORROW_STR })]);
    expect(screen.getByTestId("task-now-clear")).toBeDefined();
  });

  it("peeks at 'Ohne Termin' and expands the rest on demand", () => {
    renderList(
      Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: `t${i}`, title: `Aufgabe ${i}`, due_date: null }),
      ),
    );

    expect(sectionTitles("undated")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("task-section-expand-undated"));
    expect(sectionTitles("undated")).toHaveLength(5);
  });

  it("keeps done tasks collapsed until the section is opened", () => {
    renderList([
      makeTask({ id: "t1", title: "Erledigtes", status: "done" }),
      makeTask({ id: "t2", title: "Offenes", due_date: TODAY_STR }),
    ]);

    expect(sectionTitles("done")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("task-section-header-done"));
    expect(sectionTitles("done")).toEqual(["Erledigtes"]);
  });
});

describe("AufgabenClient — wer macht was", () => {
  it("counts each member's open tasks on their chip", () => {
    renderList([
      makeTask({ id: "t1", due_date: TODAY_STR, assigned_to: "m1" }),
      makeTask({ id: "t2", due_date: TODAY_STR, assigned_to: "m1" }),
      makeTask({ id: "t3", due_date: TODAY_STR, assigned_to: "m2" }),
      makeTask({ id: "t4", due_date: TODAY_STR }),
    ]);

    // The distribution is readable without filtering to one person.
    expect(screen.getByTestId("task-chip-m1-count").textContent).toBe("2");
    expect(screen.getByTestId("task-chip-m2-count").textContent).toBe("1");
    expect(screen.getByTestId("task-chip-unassigned-count").textContent).toBe(
      "1",
    );
    expect(screen.getByTestId("task-chip-all-count").textContent).toBe("4");
  });

  it("leaves out done tasks when counting what is open", () => {
    renderList([
      makeTask({ id: "t1", due_date: TODAY_STR, assigned_to: "m1" }),
      makeTask({ id: "t2", status: "done", assigned_to: "m1" }),
    ]);
    expect(screen.getByTestId("task-chip-m1-count").textContent).toBe("1");
  });

  it("filters the list to one family member and back", () => {
    renderList([
      makeTask({
        id: "t1",
        title: "Christians Aufgabe",
        due_date: TODAY_STR,
        assigned_to: "m1",
      }),
      makeTask({
        id: "t2",
        title: "Karinas Aufgabe",
        due_date: TODAY_STR,
        assigned_to: "m2",
      }),
    ]);

    fireEvent.click(screen.getByTestId("task-chip-m2"));
    expect(sectionTitles("now")).toEqual(["Karinas Aufgabe"]);

    fireEvent.click(screen.getByTestId("task-chip-all"));
    expect(sectionTitles("now")).toHaveLength(2);
  });

  it("surfaces tasks nobody has taken on as a visible chip", () => {
    renderList([
      makeTask({
        id: "t1",
        title: "Zugewiesen",
        due_date: TODAY_STR,
        assigned_to: "m1",
      }),
      makeTask({ id: "t2", title: "Herrenlos", due_date: TODAY_STR }),
    ]);

    // No hidden filter panel: the one query a family plan exists to answer
    // is a chip in the row.
    fireEvent.click(screen.getByTestId("task-chip-unassigned"));
    expect(sectionTitles("now")).toEqual(["Herrenlos"]);
  });

  it("offers no unassigned chip when every task has an owner", () => {
    renderList([
      makeTask({ id: "t1", due_date: TODAY_STR, assigned_to: "m1" }),
    ]);
    expect(screen.queryByTestId("task-chip-unassigned")).toBeNull();
  });

  it("says so when a filter leaves nothing to show", () => {
    renderList([makeTask({ id: "t1", due_date: TODAY_STR, assigned_to: "m1" })]);

    fireEvent.click(screen.getByTestId("task-chip-m2"));
    expect(screen.getByTestId("task-filter-empty")).toBeDefined();
  });

  it("shows the new person's name, not the one the server sent", async () => {
    // Regression: the row preferred `assigned_member_name` from the server
    // over the live member list, so reassigning showed the new person's
    // face beside the old person's name.
    renderList([
      makeTask({
        id: "t1",
        due_date: TODAY_STR,
        assigned_to: "m1",
        assigned_member_name: "Christian",
      }),
    ]);

    fireEvent.click(screen.getByTestId("task-assignee"));
    fireEvent.click(await screen.findByTestId("task-assign-m2"));

    await waitFor(() =>
      expect(
        screen.getByTestId("task-assignee").getAttribute("aria-label"),
      ).toContain("Karina"),
    );
    expect(
      screen.getByTestId("task-assignee").getAttribute("aria-label"),
    ).not.toContain("Christian");
  });

  it("assigns a task from the row and offers to undo it", async () => {
    renderList([makeTask({ id: "t1", due_date: TODAY_STR })]);

    fireEvent.click(screen.getByTestId("task-assignee"));
    fireEvent.click(await screen.findByTestId("task-assign-m2"));

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "t1"));
    expect(mockUpdate).toHaveBeenCalledWith({ assigned_to: "m2" });

    const [message, options] = lastToast();
    expect(message).toBe("Übernimmt Karina");
    expect(options.action?.label).toBe("Rückgängig");

    await act(async () => {
      options.action?.onClick();
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][0]).toEqual({ assigned_to: null });
  });
});

describe("AufgabenClient — verschieben", () => {
  it("moves a task to a named day and offers to undo it", async () => {
    renderList([makeTask({ id: "t1", due_date: null })]);

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-schedule"));
    fireEvent.click(await screen.findByTestId("task-schedule-today"));

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "t1"));
    // Exactly the day that was tapped — no guessing, unlike the old drop
    // targets that silently meant "tomorrow" or "no date at all".
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "open",
      due_date: TODAY_STR,
    });

    const [message, options] = lastToast();
    expect(message).toBe("Für heute eingeplant");
    expect(options.action?.label).toBe("Rückgängig");

    await act(async () => {
      options.action?.onClick();
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][0]).toEqual({
      status: "open",
      due_date: null,
    });
  });

  it("moves a task to tomorrow and names the day in the toast", async () => {
    renderList([makeTask({ id: "t1", due_date: null })]);

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-schedule"));
    fireEvent.click(await screen.findByTestId("task-schedule-tomorrow"));

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "t1"));
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "open",
      due_date: TOMORROW_STR,
    });
    expect(lastToast()[0]).toContain("Verschoben auf");
  });

  it("can take the date off a task entirely", async () => {
    renderList([makeTask({ id: "t1", due_date: TODAY_STR })]);

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-schedule"));
    fireEvent.click(await screen.findByTestId("task-schedule-none"));

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "t1"));
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "open",
      due_date: null,
    });
    expect(lastToast()[0]).toBe("Termin entfernt");
  });
});

describe("AufgabenClient — abhaken", () => {
  it("ticks a task off from the row and offers to undo it", async () => {
    renderList([makeTask({ id: "t1", due_date: TODAY_STR })]);

    fireEvent.click(screen.getByTestId("task-checkbox"));

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith("id", "t1"));
    expect(mockUpdate).toHaveBeenCalledWith({ status: "done" });

    // The easiest action to trigger by accident is the one that most needs
    // a way back.
    const [message, options] = lastToast();
    expect(message).toBe("Erledigt — gut gemacht!");
    expect(options.action?.label).toBe("Rückgängig");

    await act(async () => {
      options.action?.onClick();
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][0]).toEqual({ status: "open" });
  });

  it("moves the ticked-off task into Erledigt", async () => {
    renderList([makeTask({ id: "t1", title: "Trikot", due_date: TODAY_STR })]);

    fireEvent.click(screen.getByTestId("task-checkbox"));
    await waitFor(() => expect(mockEq).toHaveBeenCalled());

    expect(screen.queryByTestId("task-section-now")).toBeNull();
    fireEvent.click(screen.getByTestId("task-section-header-done"));
    expect(sectionTitles("done")).toEqual(["Trikot"]);
  });
});

describe("AufgabenClient — the shape of the screen", () => {
  it("celebrates instead of leaving a lone collapsed section", () => {
    renderList([
      makeTask({ id: "t1", status: "done" }),
      makeTask({ id: "t2", status: "done" }),
    ]);

    expect(screen.getByTestId("task-all-done")).toBeDefined();
    expect(screen.queryByTestId("task-now-clear")).toBeNull();
  });

  it("does not celebrate while work is still open", () => {
    renderList([
      makeTask({ id: "t1", status: "done" }),
      makeTask({ id: "t2", due_date: TOMORROW_STR }),
    ]);

    expect(screen.queryByTestId("task-all-done")).toBeNull();
    expect(screen.getByTestId("task-now-clear")).toBeDefined();
  });

  it("makes only collapsible headings interactive", () => {
    renderList([
      makeTask({ id: "t1", due_date: TODAY_STR }),
      makeTask({ id: "t2", due_date: null }),
    ]);

    // "Jetzt dran" toggles nothing, so it must not announce itself as a
    // control; "Ohne Termin" collapses, so it must.
    expect(screen.getByTestId("task-section-header-now").tagName).not.toBe(
      "BUTTON",
    );
    const undated = screen.getByTestId("task-section-header-undated");
    expect(undated.tagName).toBe("BUTTON");
    expect(undated.getAttribute("aria-expanded")).toBe("false");
  });

  it("lists what was just finished first, not what was due longest ago", () => {
    // Done tasks keep the incoming (newest-created-first) order rather than
    // being re-sorted by the date they happened to be due.
    renderList([
      makeTask({
        id: "t1",
        title: "Zuletzt erledigt",
        status: "done",
        due_date: isoInDays(-30),
      }),
      makeTask({
        id: "t2",
        title: "Vorher erledigt",
        status: "done",
        due_date: isoInDays(-1),
      }),
    ]);

    fireEvent.click(screen.getByTestId("task-section-header-done"));
    expect(sectionTitles("done")).toEqual([
      "Zuletzt erledigt",
      "Vorher erledigt",
    ]);
  });
});

describe("AufgabenClient — verwerfen", () => {
  it("uses a bounded dialog instead of a full-width bottom sheet", async () => {
    renderList();

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-delete"));

    const dialog = await screen.findByTestId("task-delete-confirm-dialog");
    expect(dialog.className).toContain("max-w-sm");
    expect(screen.queryByTestId("task-delete-confirm-sheet")).toBeNull();
  });

  it("offers an undo action after dismissing a task", async () => {
    renderList();

    fireEvent.keyDown(screen.getByTestId("task-card-actions"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("card-action-delete"));
    fireEvent.click(screen.getByTestId("confirm-delete-task-button"));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [message, options] = lastToast();
    expect(message).toBe("Verworfen");
    expect(options.action?.label).toBe("Rückgängig");

    await act(async () => {
      options.action?.onClick();
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][0]).toEqual({
      status: "open",
      due_date: null,
    });
  });
});
