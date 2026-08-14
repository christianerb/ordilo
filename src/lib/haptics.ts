export type HapticFeedback =
  | "selection"
  | "light"
  | "success"
  | "warning"
  | "error";

const VIBRATION_PATTERNS: Record<HapticFeedback, number | number[]> = {
  selection: 8,
  light: 10,
  success: [10, 36, 14],
  warning: [16, 32, 12],
  error: [24, 42, 24],
};

interface CapacitorHaptics {
  selectionStart?: () => Promise<void>;
  impact?: (options: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
  notification?: (options: {
    type: "SUCCESS" | "WARNING" | "ERROR";
  }) => Promise<void>;
}

function getNativeHaptics(): CapacitorHaptics | null {
  if (typeof window === "undefined") return null;

  const capacitor = (window as unknown as {
    Capacitor?: { Plugins?: { Haptics?: CapacitorHaptics } };
  }).Capacitor;

  return capacitor?.Plugins?.Haptics ?? null;
}

/**
 * Delivers semantic tactile feedback when a host platform supports it.
 *
 * The PWA falls back to the Vibration API. A future Capacitor wrapper can
 * expose native iOS/Android haptics through the same contract, so callers
 * never need to know which runtime is active. Feedback is always optional:
 * the action must stay clear without it.
 */
export function haptic(feedback: HapticFeedback): void {
  const nativeHaptics = getNativeHaptics();

  try {
    if (nativeHaptics) {
      if (feedback === "selection") {
        void nativeHaptics.selectionStart?.();
        return;
      }
      if (feedback === "success" || feedback === "warning" || feedback === "error") {
        void nativeHaptics.notification?.({ type: feedback.toUpperCase() as "SUCCESS" | "WARNING" | "ERROR" });
        return;
      }
      void nativeHaptics.impact?.({ style: "LIGHT" });
      return;
    }
  } catch {
    // Fall through to the PWA enhancement below.
  }

  vibrate(VIBRATION_PATTERNS[feedback]);
}

/**
 * Fires a short device vibration if the browser supports it.
 *
 * Kept for existing callers that need a deliberately tuned vibration
 * pattern. New UI should use {@link haptic} so native apps receive the
 * platform's semantic feedback instead.
 */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration not allowed or unsupported — silently ignore.
  }
}
