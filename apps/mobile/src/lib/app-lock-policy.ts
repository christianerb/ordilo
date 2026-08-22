/**
 * Pure state decisions for the app lock + privacy shield, kept separate
 * from the React/provider wiring so they are unit-testable without a
 * native runtime.
 */

export type AppLifecycleState = "active" | "inactive" | "background";

export interface AppLockDecision {
  /** Show the privacy shield (Ordilo mark over the content). */
  shielded: boolean;
  /**
   * Armed while away: when the app returns to `active`, the lock screen
   * appears and biometric unlock is required.
   */
  lockArmed: boolean;
}

/**
 * iOS fires `inactive` for transient interruptions (Control Center,
 * notification banners, the app switcher) and `background` only when the
 * app really leaves. The shield covers both — the app switcher snapshot
 * is taken during `inactive` — but the lock arms only on a real
 * `background`, so pulling down a banner never forces a re-unlock.
 */
export function decideOnLeaveForeground(params: {
  appLockEnabled: boolean;
  privacyShieldEnabled: boolean;
  next: AppLifecycleState;
}): AppLockDecision {
  const leaving = params.next !== "active";
  return {
    shielded: leaving && params.privacyShieldEnabled,
    lockArmed: params.next === "background" && params.appLockEnabled,
  };
}

/**
 * On return to `active` the shield always lifts immediately (React has
 * already repainted behind it). A previously armed lock now engages.
 */
export function decideOnReturnToForeground(params: {
  lockArmed: boolean;
}): AppLockDecision & { locked: boolean } {
  return {
    shielded: false,
    lockArmed: false,
    locked: params.lockArmed,
  };
}

/**
 * Cold start. The AppState listener only fires on transitions, so without
 * this decision an enabled lock would never engage when the process
 * starts fresh (force-quit, iOS eviction) — the persisted session would
 * be reachable without authentication.
 */
export function decideOnColdStart(params: {
  appLockEnabled: boolean;
  biometryAvailable: boolean;
}): { locked: boolean; keepAppLockEnabled: boolean } {
  if (!params.appLockEnabled) {
    return { locked: false, keepAppLockEnabled: false };
  }
  if (!params.biometryAvailable) {
    // Hardware or enrolment vanished after the user enabled the lock.
    // Locking now could brick the app on a device without any passcode,
    // so the setting is turned off instead — it can be re-enabled in
    // the settings once biometrics are set up again.
    return { locked: false, keepAppLockEnabled: false };
  }
  return { locked: true, keepAppLockEnabled: true };
}
