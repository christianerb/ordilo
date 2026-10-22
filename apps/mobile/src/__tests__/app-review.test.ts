import * as StoreReview from "expo-store-review";

import {
  addPositiveMoment,
  createReviewPromptState,
  noteAppLaunched,
  notePositiveMoment,
  parseReviewPromptState,
  shouldRequestReview,
  type ReviewPromptState,
} from "../lib/app-review";

// In-memory SecureStore — the review module only uses get/set.
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

jest.mock("expo-store-review", () => ({
  isAvailableAsync: jest.fn(async () => true),
  hasAction: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9);

function state(overrides: Partial<ReviewPromptState> = {}): ReviewPromptState {
  return { firstSeenAt: T0, positiveMoments: 3, lastRequestedAt: null, ...overrides };
}

describe("shouldRequestReview", () => {
  it("asks after three positive moments and two days", () => {
    expect(shouldRequestReview(state(), T0 + 2 * DAY)).toBe(true);
  });

  it("waits for at least three positive moments", () => {
    expect(shouldRequestReview(state({ positiveMoments: 2 }), T0 + 10 * DAY)).toBe(false);
  });

  it("never asks in the first two days after the first launch", () => {
    expect(shouldRequestReview(state({ positiveMoments: 10 }), T0 + 2 * DAY - 1)).toBe(false);
  });

  it("asks at most once per 120 days", () => {
    const asked = state({ positiveMoments: 20, lastRequestedAt: T0 + 5 * DAY });
    expect(shouldRequestReview(asked, T0 + 124 * DAY)).toBe(false);
    expect(shouldRequestReview(asked, T0 + 125 * DAY)).toBe(true);
  });

  it("does not ask when the device clock runs backwards", () => {
    expect(shouldRequestReview(state({ firstSeenAt: T0 + 30 * DAY }), T0)).toBe(false);
  });
});

describe("parseReviewPromptState", () => {
  it("starts a fresh clock when nothing was stored", () => {
    expect(parseReviewPromptState(null, T0)).toEqual(createReviewPromptState(T0));
  });

  it("falls back on broken or mistyped values", () => {
    expect(parseReviewPromptState("{nope", T0)).toEqual(createReviewPromptState(T0));
    expect(
      parseReviewPromptState(
        JSON.stringify({ firstSeenAt: "gestern", positiveMoments: -4, lastRequestedAt: "x" }),
        T0,
      ),
    ).toEqual(createReviewPromptState(T0));
  });

  it("keeps valid stored values", () => {
    const stored = state({ positiveMoments: 7, lastRequestedAt: T0 + DAY });
    expect(parseReviewPromptState(JSON.stringify(stored), T0 + 50 * DAY)).toEqual(stored);
  });

  it("counts moments without touching timestamps", () => {
    expect(addPositiveMoment(state({ positiveMoments: 1 }))).toEqual(state({ positiveMoments: 2 }));
  });
});

describe("notePositiveMoment", () => {
  const isAvailable = StoreReview.isAvailableAsync as jest.Mock;
  const hasAction = StoreReview.hasAction as jest.Mock;
  const requestReview = StoreReview.requestReview as jest.Mock;

  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    isAvailable.mockResolvedValue(true);
    hasAction.mockResolvedValue(true);
    requestReview.mockResolvedValue(undefined);
  });

  it("asks on the third moment after the first days, then waits 120 days", async () => {
    await noteAppLaunched(T0);
    const later = T0 + 3 * DAY;

    expect(await notePositiveMoment("document_confirmed", { now: later })).toBe(false);
    expect(await notePositiveMoment("chat_answer_with_sources", { now: later })).toBe(false);
    expect(await notePositiveMoment("document_confirmed", { now: later })).toBe(true);
    expect(requestReview).toHaveBeenCalledTimes(1);

    expect(await notePositiveMoment("document_confirmed", { now: later + 60 * DAY })).toBe(false);
    expect(await notePositiveMoment("document_confirmed", { now: later + 120 * DAY })).toBe(true);
    expect(requestReview).toHaveBeenCalledTimes(2);
  });

  it("does not move the first-launch clock on later launches", async () => {
    await noteAppLaunched(T0);
    await noteAppLaunched(T0 + 5 * DAY);
    const stored = JSON.parse(mockStore.get("ordilo.app-review") ?? "{}");
    expect(stored.firstSeenAt).toBe(T0);
  });

  it("never asks in the first two days, however good they are", async () => {
    await noteAppLaunched(T0);
    for (let i = 0; i < 5; i++) {
      expect(await notePositiveMoment("document_confirmed", { now: T0 + DAY })).toBe(false);
    }
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("skips the request when the store sheet is unavailable", async () => {
    mockStore.set("ordilo.app-review", JSON.stringify(state({ positiveMoments: 5 })));
    isAvailable.mockResolvedValue(false);
    expect(await notePositiveMoment("document_confirmed", { now: T0 + 10 * DAY })).toBe(false);

    isAvailable.mockResolvedValue(true);
    hasAction.mockResolvedValue(false);
    expect(await notePositiveMoment("document_confirmed", { now: T0 + 10 * DAY })).toBe(false);
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("swallows native errors and does not retry right away", async () => {
    mockStore.set("ordilo.app-review", JSON.stringify(state({ positiveMoments: 5 })));
    requestReview.mockRejectedValueOnce(new Error("native failure"));

    await expect(notePositiveMoment("document_confirmed", { now: T0 + 10 * DAY })).resolves.toBe(false);
    await expect(notePositiveMoment("document_confirmed", { now: T0 + 11 * DAY })).resolves.toBe(false);
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it("never stores anything but counters and timestamps", async () => {
    await notePositiveMoment("chat_answer_with_sources", { now: T0 });
    expect(Object.keys(JSON.parse(mockStore.get("ordilo.app-review") ?? "{}")).sort()).toEqual([
      "firstSeenAt",
      "lastRequestedAt",
      "positiveMoments",
    ]);
  });
});
