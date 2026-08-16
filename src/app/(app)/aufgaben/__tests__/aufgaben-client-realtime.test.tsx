import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/scan/scan-context", () => ({
  useScanActions: () => ({ openWizard: vi.fn() }),
  useDocumentViewer: () => ({ openDocument: vi.fn() }),
}));

vi.mock("@/components/ordilo/task-detail-sheet", () => ({
  TaskDetailSheet: () => null,
}));
vi.mock("@/components/ordilo/task-create-sheet", () => ({
  TaskCreateSheet: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Supabase stub with realtime support
// ---------------------------------------------------------------------------

/** Rows the next `tasks` refetch will return. */
let serverTasks: Record<string, unknown>[] = [];
/** Rows the next `documents` refetch will return. */
let serverDocuments: { id: string; title: string | null }[] = [];
/** The postgres_changes handler the component registered. */
let realtimeHandler: (() => void) | null = null;

const mockSubscribe = vi.fn();
const mockRemoveChannel = vi.fn();
const mockChannel = vi.fn();

/**
 * A chainable query stub that is also awaitable, so the same object serves
 * `.select().eq().eq().order()` and `.select().in()`.
 */
function makeQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  for (const method of ["eq", "order", "in", "limit"]) {
    query[method] = vi.fn(chain);
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return query;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: () =>
        makeQuery(
          table === "tasks"
            ? { data: serverTasks }
            : { data: serverDocuments },
        ),
    }),
    channel: (...args: unknown[]) => {
      mockChannel(...args);
      const channel = {
        on: (_event: string, _config: unknown, handler: () => void) => {
          realtimeHandler = handler;
          return channel;
        },
        subscribe: () => {
          mockSubscribe();
          return channel;
        },
      };
      return channel;
    },
    removeChannel: mockRemoveChannel,
  }),
}));

import { AufgabenClient } from "@/app/(app)/aufgaben/aufgaben-client";
import type { TaskCardData } from "@/components/ordilo/task-card";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const members = [
  { id: "m1", name: "Christian", role: "Vater" },
  { id: "m2", name: "Karina", role: "Mutter" },
];

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE");
}

const TODAY_STR = isoInDays(0);

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: null,
    title: "Schulsachen",
    description: null,
    due_date: TODAY_STR,
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-08-01T00:00:00Z",
    tags: [],
    assigned_to: null,
    ...overrides,
  };
}

function renderList(tasks: TaskCardData[]) {
  return render(
    <AufgabenClient
      initialTasks={tasks}
      members={members}
      familyId="fam-1"
    />,
  );
}

/** Fire the realtime event the family's other phone would have caused. */
async function emitRealtimeChange() {
  await act(async () => {
    realtimeHandler?.();
  });
}

beforeEach(() => {
  serverTasks = [];
  serverDocuments = [];
  realtimeHandler = null;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AufgabenClient — one list across two phones", () => {
  it("subscribes to this family's tasks only", () => {
    renderList([makeTask()]);

    expect(mockChannel).toHaveBeenCalledWith("tasks-fam-1");
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("does not subscribe without a family", () => {
    render(
      <AufgabenClient initialTasks={[]} members={members} familyId={null} />,
    );
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("drops a task the other phone ticked off", async () => {
    renderList([makeTask({ id: "t1", title: "Trikot" })]);
    expect(screen.getByTestId("task-section-now")).toBeDefined();

    // Karina completed it on her phone.
    serverTasks = [
      { ...makeTask({ id: "t1", title: "Trikot", status: "done" }) },
    ];
    await emitRealtimeChange();

    await waitFor(() =>
      expect(screen.queryByTestId("task-section-now")).toBeNull(),
    );
    expect(screen.getByTestId("task-section-done")).toBeDefined();
  });

  it("picks up a task the other phone created", async () => {
    renderList([makeTask({ id: "t1", title: "Trikot" })]);

    serverTasks = [
      { ...makeTask({ id: "t1", title: "Trikot" }) },
      { ...makeTask({ id: "t2", title: "Elternabend" }) },
    ];
    await emitRealtimeChange();

    await waitFor(() =>
      expect(screen.getByText("Elternabend")).toBeDefined(),
    );
  });

  it("shows who the other phone handed a task to", async () => {
    renderList([makeTask({ id: "t1", assigned_to: null })]);

    serverTasks = [{ ...makeTask({ id: "t1", assigned_to: "m2" }) }];
    await emitRealtimeChange();

    await waitFor(() =>
      expect(
        screen.getByTestId("task-assignee").getAttribute("aria-label"),
      ).toContain("Karina"),
    );
    // The name is resolved from the live member list, so it cannot lag
    // behind the id the way a server-rendered name would.
    expect(screen.getByTestId("task-chip-m2-count").textContent).toBe("1");
  });

  it("keeps the member filter through an update from elsewhere", async () => {
    renderList([
      makeTask({ id: "t1", title: "Christians", assigned_to: "m1" }),
      makeTask({ id: "t2", title: "Karinas", assigned_to: "m2" }),
    ]);

    fireEvent.click(screen.getByTestId("task-chip-m2"));
    expect(screen.getByText("Karinas")).toBeDefined();
    expect(screen.queryByText("Christians")).toBeNull();

    serverTasks = [
      { ...makeTask({ id: "t1", title: "Christians", assigned_to: "m1" }) },
      { ...makeTask({ id: "t2", title: "Karinas", assigned_to: "m2" }) },
      { ...makeTask({ id: "t3", title: "Neu", assigned_to: "m1" }) },
    ];
    await emitRealtimeChange();

    // Merging into local state rather than refreshing the route is the
    // whole point: the filter survives somebody else's edit.
    await waitFor(() =>
      expect(screen.getByTestId("task-chip-m1-count").textContent).toBe("2"),
    );
    expect(screen.getByText("Karinas")).toBeDefined();
    expect(screen.queryByText("Christians")).toBeNull();
  });

  it("carries the source document title over to the refreshed rows", async () => {
    renderList([makeTask({ id: "t1", document_id: null })]);

    serverTasks = [{ ...makeTask({ id: "t1", document_id: "doc-9" }) }];
    serverDocuments = [{ id: "doc-9", title: "Stromrechnung" }];
    await emitRealtimeChange();

    // The title shows up twice: once in the meta row, once in the
    // screen-reader-only link to the document.
    await waitFor(() =>
      expect(screen.getAllByText("Stromrechnung").length).toBeGreaterThan(0),
    );
  });

  it("leaves the list alone when the refetch comes back empty-handed", async () => {
    renderList([makeTask({ id: "t1", title: "Trikot" })]);

    // A failed query returns { data: null } — better to show slightly stale
    // tasks than to blank the screen.
    serverTasks = null as unknown as Record<string, unknown>[];
    await emitRealtimeChange();

    expect(screen.getByText("Trikot")).toBeDefined();
  });

  it("unsubscribes when the view goes away", () => {
    const { unmount } = renderList([makeTask()]);
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});
