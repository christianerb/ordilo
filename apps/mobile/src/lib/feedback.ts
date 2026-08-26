/**
 * The haptic grammar of the app, in one place. Scattered
 * `Haptics.notificationAsync(...)` calls drift apart over time; these
 * helpers keep feedback consistent and make the intent readable at the
 * call site.
 *
 * - `tap()`     — light impact: tab switches, list presses, link opens
 * - `select()`  — selection tick: gesture thresholds, pickers
 * - `commit()`  — medium impact: a reversible commit (swipe-complete,
 *                 sheet opened by gesture)
 * - `success()` — notification: a mutation landed
 * - `fail()`    — notification: something went wrong
 *
 * All helpers are fire-and-forget on purpose: haptics must never block
 * the UI path they confirm — and a platform that cannot vibrate (or
 * denies it) must never surface as an unhandled rejection.
 */
import * as Haptics from "expo-haptics";

/** Swallows platform failures — haptics are a nicety, never an error. */
function quiet(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => undefined,
    () => undefined,
  );
}

export function tap(): void {
  void quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function select(): void {
  void quiet(Haptics.selectionAsync());
}

export function commit(): void {
  void quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export async function success(): Promise<void> {
  await quiet(
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

export async function fail(): Promise<void> {
  await quiet(
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
}
