import { AudioLines, Link, Mic, PhoneOff, Search } from "lucide-react-native";
import { StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, { useReducedMotion, type AnimatedStyle } from "react-native-reanimated";

import type { LiveConversationStatus } from "../lib/live-conversation";
import {
  contentEntering,
  cssEaseOut,
  durations,
  feedbackExiting,
} from "../theme/motion";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { OrdiloMark } from "./ordilo-mark";
import { SpringPressable } from "./ui";

const STATES = [
  { status: "connecting", label: "Ordilo verbindet sich …", compact: "Verbinden …", icon: Link },
  { status: "listening", label: "Ordilo hört zu", compact: "Ich höre zu", icon: Mic },
  { status: "thinking", label: "Ordilo schaut nach …", compact: "Ich prüfe …", icon: Search },
  { status: "speaking", label: "Ordilo antwortet", compact: "Antworten", icon: AudioLines },
  { status: "ending", label: "Gespräch endet …", compact: "Beenden …", icon: PhoneOff },
] as const;

const ENTERING = contentEntering();
const EXITING = feedbackExiting();
const TEXT_TRANSITION = {
  transitionProperty: "opacity",
  transitionDuration: durations.fast,
  transitionTimingFunction: cssEaseOut,
} as const;
const HALO_TRANSITION = {
  transitionProperty: ["opacity", "transform"],
  transitionDuration: durations.fast,
  transitionTimingFunction: cssEaseOut,
} satisfies AnimatedStyle<ViewStyle>;

export function LiveConversationBar({
  lastTranscript,
  onStop,
  status,
}: {
  lastTranscript: string;
  onStop: () => void;
  status: LiveConversationStatus;
}) {
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const current = STATES.find((state) => state.status === status);
  const ready = status === "listening" || status === "speaking";

  if (!current) return null;

  const helper = status === "connecting"
    ? "Einen Moment, gleich geht’s los."
    : status === "ending"
      ? "Das Gespräch wird beendet."
      : lastTranscript
        ? `„${lastTranscript}“`
        : "Du kannst jederzeit sprechen.";

  return (
    <Animated.View
      testID="live-conversation-bar"
      entering={ENTERING}
      exiting={EXITING}
      style={[styles.bar, largeText && styles.largeBar]}
    >
      {!largeText && <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.mark}
      >
        <Animated.View
          testID="live-state-halo"
          style={[
            styles.halo,
            HALO_TRANSITION,
            {
              opacity: status === "ending" ? 0 : ready ? 1 : 0.35,
              transform: [{ scale: reduced || ready ? 1 : 0.94 }],
            },
          ]}
        />
        <OrdiloMark size={32} />
        <View style={styles.badge}>
          {STATES.map(({ status: phase, icon: Icon }) => (
            <Animated.View
              key={phase}
              style={[
                styles.glyph,
                TEXT_TRANSITION,
                { opacity: phase === status ? 1 : 0 },
              ]}
            >
              <Icon color={colors.harborBlue} size={12} />
            </Animated.View>
          ))}
        </View>
      </View>}
      <View style={[styles.copy, largeText && styles.largeCopy]}>
        <View
          accessible
          accessibilityLabel={current.label}
          accessibilityLiveRegion="polite"
          style={styles.status}
        >
          {/* Reserve the longest label at the user's actual font size.
              Neither a transcript delta nor a status swap moves the stop target. */}
          <Text
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.title, styles.spacer]}
          >
            {largeText ? "Verbinden …" : "Ordilo verbindet sich …"}
          </Text>
          {/* Persistent layers retarget from current opacity on interruptions.
              No keyed remount, stale timeout, or per-frame React state. */}
          {STATES.map(({ status: phase, label, compact }) => (
            <Animated.Text
              key={phase}
              testID={`live-label-${phase}`}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.title,
                styles.label,
                TEXT_TRANSITION,
                { opacity: phase === status ? 1 : 0 },
              ]}
            >
              {largeText ? compact : label}
            </Animated.Text>
          ))}
        </View>
        <Text
          numberOfLines={1}
          style={styles.transcript}
        >
          {helper}
        </Text>
      </View>
      <SpringPressable
        accessibilityLabel={status === "ending" ? "Gespräch wird beendet" : "Live-Gespräch beenden"}
        disabled={status === "ending"}
        onPress={onStop}
        style={[styles.stop, largeText && styles.largeStop]}
      >
        <PhoneOff color={colors.warmWhite} size={18} />
      </SpringPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderColor: colors.harborLine,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    padding: spacing.sm,
  },
  largeBar: { flexDirection: "column", alignItems: "stretch" },
  largeCopy: { flex: 0 },
  largeStop: { alignSelf: "flex-end" },
  mark: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  halo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.warmWhite,
    borderRadius: radii.pill,
  },
  badge: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.harborLine,
    borderRadius: radii.pill,
    borderWidth: 1,
    bottom: 0,
    height: 20,
    position: "absolute",
    right: 0,
    width: 20,
  },
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  status: { minWidth: 0 },
  title: { color: colors.harborBlueDarker, ...typography.title },
  spacer: { opacity: 0 },
  label: {
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%",
    transform: [{ translateY: "-50%" }],
  },
  transcript: { color: colors.mistDark, ...typography.label },
  stop: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
});
