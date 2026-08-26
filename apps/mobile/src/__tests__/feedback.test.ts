import * as Haptics from "expo-haptics";

import { commit, fail, select, success, tap } from "../lib/feedback";

/**
 * The haptic grammar is the one place haptics live — these tests pin
 * which platform feedback each helper fires, so a refactor cannot
 * quietly turn a commit into a notification (or drop feedback).
 */
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

const impactAsync = jest.mocked(Haptics.impactAsync);
const notificationAsync = jest.mocked(Haptics.notificationAsync);
const selectionAsync = jest.mocked(Haptics.selectionAsync);

describe("feedback haptics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("tap() fires a light impact without blocking", () => {
    tap();
    expect(impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it("select() fires the selection tick", () => {
    select();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("commit() fires a medium impact for reversible gesture commits", () => {
    commit();
    expect(impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it("success() fires the success notification", async () => {
    await success();
    expect(notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it("fail() fires the error notification", async () => {
    await fail();
    expect(notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
  });

  it("tap() and select() swallow platform failures quietly", async () => {
    impactAsync.mockRejectedValueOnce(new Error("no haptics"));
    selectionAsync.mockRejectedValueOnce(new Error("no haptics"));
    expect(() => {
      tap();
      select();
    }).not.toThrow();
    // Flush microtasks; a swallowed rejection must not surface.
    await Promise.resolve();
  });

  it("success() resolves even when the platform rejects", async () => {
    notificationAsync.mockRejectedValueOnce(new Error("no haptics"));
    await expect(success()).resolves.toBeUndefined();
  });
});
