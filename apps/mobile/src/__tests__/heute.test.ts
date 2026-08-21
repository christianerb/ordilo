import {
  acceptInboundSuggestion,
  eventOccursOn,
  formatDueLabel,
  getEventOccurrences,
  getHomeGreeting,
  getInboundHeadline,
  getUpcomingEntries,
  mergeJournalDocuments,
  setHeuteTaskStatus,
  type HeuteDocument,
  type HeuteEvent,
  type HeuteInboundDiscovery,
  type HeuteTask,
} from "../lib/heute";

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

jest.mock("../lib/analytics", () => ({
  recordProductEvent: jest.fn(async () => {}),
}));

const DOCUMENT = (id: string, status = "confirmed"): HeuteDocument => ({
  id,
  title: `Dokument ${id}`,
  originalFilename: null,
  mimeType: "application/pdf",
  status,
  createdAt: "2026-08-21T10:00:00Z",
  summary: null,
});

const TASK = (overrides: Partial<HeuteTask> = {}): HeuteTask => ({
  id: "task-1",
  familyId: "fam-1",
  title: "Rechnung bezahlen",
  description: null,
  dueDate: "2026-08-21",
  status: "open",
  confidence: 1,
  confirmed: true,
  createdAt: "2026-08-21T10:00:00Z",
  tags: [],
  documentId: null,
  documentTitle: null,
  ...overrides,
});

const EVENT = (overrides: Partial<HeuteEvent> = {}): HeuteEvent => ({
  id: "event-1",
  title: "Elternabend",
  startsOn: "2026-08-21",
  endsOn: "2026-08-21",
  allDay: false,
  startsTime: "18:00",
  endsTime: "19:00",
  recurrence: "none",
  recurrenceUntil: null,
  recurrenceExceptions: [],
  location: null,
  responsibleMemberId: null,
  attendeeNames: [],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("Heute pure helpers", () => {
  it("uses the Home greeting boundaries, including evening overnight", () => {
    expect(getHomeGreeting(new Date(2026, 7, 21, 5))).toBe("Guten Morgen");
    expect(getHomeGreeting(new Date(2026, 7, 21, 12))).toBe("Guten Tag");
    expect(getHomeGreeting(new Date(2026, 7, 21, 18))).toBe("Guten Abend");
    expect(getHomeGreeting(new Date(2026, 7, 21, 2))).toBe("Guten Abend");
  });

  it("merges review documents before recent rows without duplicates or failures", () => {
    const merged = mergeJournalDocuments(
      [DOCUMENT("review", "analyzed"), DOCUMENT("failed", "failed")],
      [DOCUMENT("review", "analyzed"), DOCUMENT("recent"), DOCUMENT("failed", "failed")],
    );

    expect(merged.map((document) => document.id)).toEqual(["review", "recent"]);
  });

  it("uses human due labels for today and overdue tasks", () => {
    const now = new Date(2026, 7, 21, 12);
    expect(formatDueLabel("2026-08-21", now)).toEqual({
      text: "Heute",
      overdue: false,
    });
    expect(formatDueLabel("2026-08-20", now)).toEqual({
      text: "seit gestern",
      overdue: true,
    });
    expect(formatDueLabel("2026-08-05", now)).toEqual({
      text: "seit 2 Wochen",
      overdue: true,
    });
  });

  it("expands recurring events but respects exceptions", () => {
    const weekly = EVENT({
      recurrence: "weekly",
      recurrenceExceptions: ["2026-08-28"],
    });

    expect(eventOccursOn(weekly, "2026-08-28")).toBe(false);
    expect(eventOccursOn(weekly, "2026-09-04")).toBe(true);
    expect(
      getEventOccurrences([weekly], new Date(2026, 7, 21), 14).map(
        (occurrence) => occurrence.date,
      ),
    ).toEqual(["2026-08-21", "2026-09-04"]);
  });

  it("combines upcoming tasks and events into one date-sorted preview", () => {
    const entries = getUpcomingEntries(
      [TASK({ id: "task-2", dueDate: "2026-08-24", title: "Versicherung" })],
      [
        {
          id: "event-2",
          title: "Kinderarzt",
          date: "2026-08-22",
          startsTime: "09:00",
          allDay: false,
          location: null,
          attendeeNames: [],
        },
      ],
      new Date(2026, 7, 21),
    );

    expect(entries.map((entry) => entry.title)).toEqual([
      "Kinderarzt",
      "Versicherung",
    ]);
  });

  it("uses the singular inbound headline for a task discovery", () => {
    const discovery: HeuteInboundDiscovery = {
      id: "email-1",
      subject: "Schule",
      fromAddress: "Schule <post@schule.de>",
      receivedAt: "2026-08-21T10:00:00Z",
      retentionPending: true,
      suggestions: [
        {
          id: "suggestion-1",
          kind: "task",
          title: "Unterschreiben",
          startsOn: null,
          startsTime: null,
          endsTime: null,
          location: null,
          note: null,
        },
      ],
    };

    expect(getInboundHeadline(discovery)).toBe(
      "Ich habe eine Aufgabe in einer E-Mail gefunden.",
    );
  });
});

describe("Heute mutations", () => {
  it("updates a task and records task_completed after marking it done", async () => {
    const query = {} as { update: jest.Mock; eq: jest.Mock };
    query.update = jest.fn(() => query);
    query.eq = jest.fn(async () => ({ error: null }));
    mockFrom.mockReturnValue(query);

    const result = await setHeuteTaskStatus("task-1", "done", "fam-1");

    expect(result).toEqual({ success: true, data: null });
    expect(mockFrom).toHaveBeenCalledWith("tasks");
    expect(query.update).toHaveBeenCalledWith({ status: "done" });
    expect(query.eq).toHaveBeenCalledWith("id", "task-1");
  });

  it("returns a German error when the task update is rejected", async () => {
    const query = {} as { update: jest.Mock; eq: jest.Mock };
    query.update = jest.fn(() => query);
    query.eq = jest.fn(async () => ({ error: { message: "RLS" } }));
    mockFrom.mockReturnValue(query);

    await expect(setHeuteTaskStatus("task-1", "done", "fam-1")).resolves.toEqual({
      success: false,
      error: "Das hat gerade nicht geklappt. Bitte versuch es nochmal.",
    });
  });

  it("calls the inbound-accept RPC with the suggestion id", async () => {
    mockRpc.mockResolvedValue({ error: null });

    await expect(acceptInboundSuggestion("suggestion-1")).resolves.toEqual({
      success: true,
      data: null,
    });

    expect(mockRpc).toHaveBeenCalledWith("accept_inbound_suggestion", {
      p_suggestion_id: "suggestion-1",
    });
  });
});
