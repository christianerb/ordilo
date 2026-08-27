import { describePushPermission } from "../lib/notifications";

describe("describePushPermission", () => {
  it("is granted only when the OS says granted", () => {
    expect(
      describePushPermission({ granted: true, canAskAgain: false, status: "granted" }),
    ).toBe("granted");
  });

  it("can still ask when undetermined or askable again", () => {
    expect(
      describePushPermission({
        granted: false,
        canAskAgain: false,
        status: "undetermined",
      }),
    ).toBe("ask");
    expect(
      describePushPermission({
        granted: false,
        canAskAgain: true,
        status: "denied",
      }),
    ).toBe("ask");
  });

  it("is blocked when denied and iOS will not show the dialog again", () => {
    expect(
      describePushPermission({
        granted: false,
        canAskAgain: false,
        status: "denied",
      }),
    ).toBe("blocked");
  });
});
