import {
  ACTIVITY_FEED_LIMIT,
  activityDestination,
  activityDetailLabel,
  formatActivityWhen,
  loadFamilyActivity,
} from "../lib/activity";

/**
 * Behavioral tests for the Neuigkeiten feed: the view query contract,
 * the German labels, the relative timestamps, and where a row leads.
 */

const mockLimit = jest.fn();
const mockOrder = jest.fn(() => ({ limit: mockLimit }));
const mockEq = jest.fn(() => ({ order: mockOrder }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function activityRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: "document:doc-1",
    family_id: "fam-1",
    kind: "document",
    title: "Schreiben der Kita",
    detail: "analyzed",
    occurred_at: "2026-09-12T10:00:00.000Z",
    ref_id: "doc-1",
    ...overrides,
  };
}

describe("loadFamilyActivity", () => {
  it("reads the view scoped to the family, newest first, capped", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    await loadFamilyActivity("fam-1");

    expect(mockFrom).toHaveBeenCalledWith("family_activity");
    expect(mockEq).toHaveBeenCalledWith("family_id", "fam-1");
    expect(mockOrder).toHaveBeenCalledWith("occurred_at", {
      ascending: false,
    });
    expect(mockLimit).toHaveBeenCalledWith(ACTIVITY_FEED_LIMIT);
  });

  it("maps snake_case rows into feed items", async () => {
    mockLimit.mockResolvedValue({ data: [activityRow()], error: null });

    const items = await loadFamilyActivity("fam-1");

    expect(items).toEqual([
      {
        id: "document:doc-1",
        kind: "document",
        title: "Schreiben der Kita",
        detail: "analyzed",
        occurredAt: "2026-09-12T10:00:00.000Z",
        refId: "doc-1",
      },
    ]);
  });

  it("drops rows with a kind the app does not know", async () => {
    mockLimit.mockResolvedValue({
      data: [activityRow(), activityRow({ activity_id: "x", kind: "plasma" })],
      error: null,
    });

    const items = await loadFamilyActivity("fam-1");

    expect(items.map((item) => item.kind)).toEqual(["document"]);
  });

  it("falls back to a placeholder title for empty titles", async () => {
    mockLimit.mockResolvedValue({
      data: [activityRow({ title: "  " })],
      error: null,
    });

    const [item] = await loadFamilyActivity("fam-1");

    expect(item.title).toBe("Ohne Titel");
  });

  it("throws the friendly German error when the read fails", async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: "rls" } });

    await expect(loadFamilyActivity("fam-1")).rejects.toThrow(
      "Das hat gerade nicht geklappt. Bitte versuch es nochmal.",
    );
  });
});

describe("activityDestination", () => {
  it("leads documents to their detail page", () => {
    expect(activityDestination({ kind: "document", refId: "doc-1" })).toEqual({
      pathname: "/document/[id]",
      params: { id: "doc-1" },
    });
  });

  it("leads tasks and events into the plan, preselected", () => {
    expect(activityDestination({ kind: "task", refId: "t-1" })).toEqual({
      pathname: "/(tabs)/plan",
      params: { task: "t-1" },
    });
    expect(activityDestination({ kind: "event", refId: "e-1" })).toEqual({
      pathname: "/(tabs)/plan",
      params: { event: "e-1" },
    });
  });

  it("leads mail to the Posteingang and members to the Familie", () => {
    expect(activityDestination({ kind: "email", refId: null })).toEqual({
      pathname: "/posteingang",
    });
    expect(activityDestination({ kind: "member", refId: "p-1" })).toEqual({
      pathname: "/familie",
    });
  });

  it("keeps rows without a ref read-only", () => {
    expect(activityDestination({ kind: "document", refId: null })).toBeNull();
    expect(activityDestination({ kind: "task", refId: null })).toBeNull();
    expect(activityDestination({ kind: "event", refId: null })).toBeNull();
  });
});

describe("activityDetailLabel", () => {
  it("translates raw document statuses into plain German", () => {
    expect(
      activityDetailLabel({ kind: "document", detail: "analyzed" }),
    ).toBe("Gelesen");
    expect(
      activityDetailLabel({ kind: "document", detail: "confirmed" }),
    ).toBe("Abgelegt");
    expect(activityDetailLabel({ kind: "document", detail: "failed" })).toBe(
      "Nicht lesbar",
    );
    expect(activityDetailLabel({ kind: "document", detail: "uploaded" })).toBe(
      "Hochgeladen",
    );
  });

  it("capitalizes the done marker of tasks", () => {
    expect(activityDetailLabel({ kind: "task", detail: "erledigt" })).toBe(
      "Erledigt",
    );
  });

  it("passes event dates, senders, and the member line through", () => {
    expect(activityDetailLabel({ kind: "event", detail: "05.09.2026" })).toBe(
      "05.09.2026",
    );
    expect(
      activityDetailLabel({ kind: "email", detail: "kita@example.org" }),
    ).toBe("kita@example.org");
    expect(
      activityDetailLabel({
        kind: "member",
        detail: "ist der Familie beigetreten",
      }),
    ).toBe("ist der Familie beigetreten");
  });

  it("is silent when there is no detail", () => {
    expect(activityDetailLabel({ kind: "task", detail: null })).toBeNull();
  });
});

describe("formatActivityWhen", () => {
  const now = new Date(2026, 8, 12, 15, 0, 0); // Sa, 12.09.2026 15:00 local

  it("speaks in minutes and hours for today", () => {
    expect(formatActivityWhen(new Date(2026, 8, 12, 14, 59, 40).toISOString(), now)).toBe(
      "Gerade eben",
    );
    expect(formatActivityWhen(new Date(2026, 8, 12, 14, 55).toISOString(), now)).toBe(
      "vor 5 Min.",
    );
    expect(formatActivityWhen(new Date(2026, 8, 12, 12, 0).toISOString(), now)).toBe(
      "vor 3 Std.",
    );
  });

  it("names yesterday and falls back to a short date beyond that", () => {
    expect(formatActivityWhen(new Date(2026, 8, 11, 9, 0).toISOString(), now)).toBe(
      "Gestern",
    );
    expect(formatActivityWhen(new Date(2026, 8, 9, 9, 0).toISOString(), now)).toBe(
      "9. Sept.",
    );
  });

  it("never claims a negative duration for clock drift", () => {
    expect(formatActivityWhen(new Date(2026, 8, 12, 16, 0).toISOString(), now)).toBe(
      "Gerade eben",
    );
  });

  it("stays silent on an unparseable timestamp", () => {
    expect(formatActivityWhen("kein-datum", now)).toBe("");
  });
});
