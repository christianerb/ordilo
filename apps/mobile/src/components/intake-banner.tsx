import {
  AlertCircle,
  ChevronRight,
  CloudOff,
  CloudUpload,
} from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { OrdiloMark } from "./ordilo-mark";
import {
  intakeStatusLabel,
  type IntakeStatus,
  type IntakeTone,
} from "@/src/lib/intake-status";
import { contentEntering, feedbackExiting } from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const TONE_SURFACE: Record<IntakeTone, string> = {
  working: colors.washSageSoft,
  waiting: colors.sandLight,
  attention: colors.washApricot,
  error: colors.destructiveBackground,
};

const TONE_LINE: Record<IntakeTone, string> = {
  working: colors.harborLine,
  waiting: colors.mistLight,
  attention: "rgba(228, 96, 24, 0.24)",
  error: "rgba(192, 57, 43, 0.24)",
};

const TONE_ACCENT: Record<IntakeTone, string> = {
  working: colors.harborBlue,
  waiting: colors.mistDark,
  attention: colors.warmApricot,
  error: colors.destructive,
};

/**
 * The one banner for documents on their way in.
 *
 * It used to be a grey strip with a sentence in it — honest, and easy to
 * ignore. Now it says which of the four things is happening (Ordilo is
 * reading, the upload is waiting, something needs a person, the queue is
 * unreadable), shows Ordilo doing the work, and carries a live track
 * along its bottom edge while there is real progress. Under Reduce
 * Motion the track holds still and only the colour carries the state.
 */
export function IntakeBanner({
  onPress,
  status,
  topInset,
}: {
  onPress: () => void;
  status: IntakeStatus;
  /** Safe-area top inset — the banner sits under the status bar. */
  topInset: number;
}) {
  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(0);
  const running = status.tone === "working" && !reduceMotion;

  useEffect(() => {
    if (!running) {
      sweep.value = 0;
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [running, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    left: `${sweep.value * 70}%`,
  }));

  return (
    <Animated.View entering={contentEntering()} exiting={feedbackExiting()}>
      <Pressable
        accessibilityHint="Öffnet den Eingang"
        accessibilityLabel={intakeStatusLabel(status)}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.banner,
          {
            backgroundColor: TONE_SURFACE[status.tone],
            borderBottomColor: TONE_LINE[status.tone],
            paddingTop: topInset + spacing.sm,
          },
          pressed && styles.bannerPressed,
        ]}
      >
        <View style={styles.row}>
          <View style={styles.badge}>
            <ToneGlyph tone={status.tone} />
            {status.count > 1 ? (
              <View style={styles.countPill}>
                <Text style={styles.countLabel}>{status.count}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>
              {status.title}
            </Text>
            <Text numberOfLines={2} style={styles.detail}>
              {status.detail}
            </Text>
          </View>
          <ChevronRight
            color={TONE_ACCENT[status.tone]}
            size={20}
            strokeWidth={2}
          />
        </View>

        <View style={styles.track}>
          {running ? (
            <Animated.View
              style={[
                styles.trackSweep,
                { backgroundColor: TONE_ACCENT[status.tone] },
                sweepStyle,
              ]}
            />
          ) : (
            <View
              style={[
                styles.trackRest,
                { backgroundColor: TONE_ACCENT[status.tone] },
              ]}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Ordilo itself does the reading; the other states get a plain glyph. */
function ToneGlyph({ tone }: { tone: IntakeTone }) {
  if (tone === "working") return <OrdiloMark size={26} />;
  if (tone === "waiting") {
    return <CloudUpload color={colors.mistDark} size={20} strokeWidth={1.9} />;
  }
  if (tone === "attention") {
    return <AlertCircle color={colors.warmApricot} size={20} strokeWidth={2} />;
  }
  return <CloudOff color={colors.destructive} size={20} strokeWidth={2} />;
}

const styles = StyleSheet.create({
  banner: {
    borderBottomWidth: 1,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bannerPressed: { opacity: 0.9 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm + 2,
    minHeight: 48,
  },
  badge: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  countPill: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: colors.warmWhite,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4,
    position: "absolute",
    right: -6,
    top: -5,
  },
  countLabel: { color: colors.warmWhite, ...typography.label },
  copy: { flex: 1, gap: 1, minWidth: 0 },
  title: { color: colors.graphite, ...typography.headline },
  detail: { color: colors.mistDark, ...typography.timestamp },
  track: {
    backgroundColor: "rgba(38, 36, 33, 0.06)",
    borderRadius: radii.pill,
    height: 3,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  /** A moving highlight: real progress, without claiming a percentage. */
  trackSweep: {
    borderRadius: radii.pill,
    bottom: 0,
    position: "absolute",
    top: 0,
    width: "30%",
  },
  trackRest: { borderRadius: radii.pill, height: 3, opacity: 0.45, width: "100%" },
});
