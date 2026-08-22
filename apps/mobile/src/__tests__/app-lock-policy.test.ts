import {
  decideOnColdStart,
  decideOnLeaveForeground,
  decideOnReturnToForeground,
} from "../lib/app-lock-policy";

describe("decideOnLeaveForeground", () => {
  it("shows the shield on any interruption when enabled", () => {
    for (const next of ["inactive", "background"] as const) {
      const decision = decideOnLeaveForeground({
        appLockEnabled: false,
        privacyShieldEnabled: true,
        next,
      });
      expect(decision.shielded).toBe(true);
    }
  });

  it("never shields while the app stays active", () => {
    const decision = decideOnLeaveForeground({
      appLockEnabled: true,
      privacyShieldEnabled: true,
      next: "active",
    });
    expect(decision).toEqual({ shielded: false, lockArmed: false });
  });

  it("arms the lock only on a real background, not on transient inactive", () => {
    // Control Center pull-down fires `inactive` — that must NOT lock the
    // app, otherwise a banner glance would force a Face ID round-trip.
    const inactive = decideOnLeaveForeground({
      appLockEnabled: true,
      privacyShieldEnabled: false,
      next: "inactive",
    });
    expect(inactive.lockArmed).toBe(false);

    const background = decideOnLeaveForeground({
      appLockEnabled: true,
      privacyShieldEnabled: false,
      next: "background",
    });
    expect(background.lockArmed).toBe(true);
  });

  it("respects both toggles independently", () => {
    const decision = decideOnLeaveForeground({
      appLockEnabled: false,
      privacyShieldEnabled: false,
      next: "background",
    });
    expect(decision).toEqual({ shielded: false, lockArmed: false });
  });
});

describe("decideOnReturnToForeground", () => {  it("lifts the shield and engages a previously armed lock", () => {
    expect(decideOnReturnToForeground({ lockArmed: true })).toEqual({
      shielded: false,
      lockArmed: false,
      locked: true,
    });
  });

  it("just lifts the shield when no lock was armed", () => {
    expect(decideOnReturnToForeground({ lockArmed: false })).toEqual({
      shielded: false,
      lockArmed: false,
      locked: false,
    });
  });
});

describe("decideOnColdStart", () => {
  it("locks immediately when the lock is enabled and biometrics exist", () => {
    // No background→active transition fires on a fresh process start —
    // without this, a force-quit would bypass the enabled lock.
    expect(
      decideOnColdStart({ appLockEnabled: true, biometryAvailable: true }),
    ).toEqual({ locked: true, keepAppLockEnabled: true });
  });

  it("stays unlocked when the lock is off", () => {
    expect(
      decideOnColdStart({ appLockEnabled: false, biometryAvailable: true }),
    ).toEqual({ locked: false, keepAppLockEnabled: false });
  });

  it("disables the setting instead of bricking the app when biometrics vanished", () => {
    expect(
      decideOnColdStart({ appLockEnabled: true, biometryAvailable: false }),
    ).toEqual({ locked: false, keepAppLockEnabled: false });
  });
});
