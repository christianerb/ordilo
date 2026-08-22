import { haptics } from "../lib/haptics";
import * as Haptics from "expo-haptics";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

const mocked = Haptics as jest.Mocked<typeof Haptics>;

describe("haptics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fires a light impact for a plain tap", () => {
    haptics.tap();
    expect(mocked.impactAsync).toHaveBeenCalledWith("light");
  });

  it("fires selection for value changes", () => {
    haptics.selection();
    expect(mocked.selectionAsync).toHaveBeenCalled();
  });

  it("maps semantic events to notification feedback", () => {
    haptics.success();
    haptics.warning();
    haptics.error();
    expect(mocked.notificationAsync).toHaveBeenNthCalledWith(1, "success");
    expect(mocked.notificationAsync).toHaveBeenNthCalledWith(2, "warning");
    expect(mocked.notificationAsync).toHaveBeenNthCalledWith(3, "error");
  });

  it("swallows rejections — haptics must never break an interaction", async () => {
    mocked.impactAsync.mockRejectedValueOnce(new Error("no haptic engine"));
    expect(() => haptics.tap()).not.toThrow();
    // Let the rejected promise settle inside the helper.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});
