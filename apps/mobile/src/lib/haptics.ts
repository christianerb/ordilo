import * as Haptics from "expo-haptics";

/**
 * Semantic haptics for the native app (DESIGN.md: "Spürbar, nicht
 * verspielt" — haptics only on real state changes, never as decoration).
 *
 * Every helper swallows rejections: haptics are a nicety, and on devices
 * without a Taptic Engine or with system haptics disabled they must
 * never break an interaction.
 */

function safe(call: () => Promise<void>): void {
  void call().catch(() => {});
}

export const haptics = {
  /** A plain tap on a button, row, or tab. */
  tap() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Value changed (toggles, pickers, steppers). */
  selection() {
    safe(() => Haptics.selectionAsync());
  },
  /** Something completed: saved, sent, confirmed. */
  success() {
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },
  /** Something needs attention: validation failed, action unavailable. */
  warning() {
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    );
  },
  /** Something failed or is about to be destroyed. */
  error() {
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    );
  },
} as const;
