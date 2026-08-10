/**
 * Fires a short device vibration if the platform supports it.
 *
 * Feature-detected and wrapped in try/catch: support varies (iOS Safari
 * has none at all; some browsers reject the call outside a user gesture
 * or in certain contexts). Always a no-op enhancement, never required for
 * the action it accompanies to work.
 */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration not allowed or unsupported — silently ignore.
  }
}
