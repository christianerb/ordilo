import { Upload } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { OrdiloCharacter } from "./ordilo-character";
import type { ScanProcessingStep } from "../lib/scan";
import { easeInOut } from "../theme/motion";
import { colors, radii } from "../theme/tokens";

export type ScanProcessingStage = "upload" | ScanProcessingStep;

export function ScanProcessingHero({
  stage,
}: {
  stage: ScanProcessingStage;
}) {
  const reduceMotion = useReducedMotion();
  const uploadLift = useSharedValue(0);
  const scanProgress = useSharedValue(0.5);
  const discoveryProgress = useSharedValue(1);
  const stageLabel =
    stage === "upload"
      ? "Dokument wird hochgeladen"
      : stage === "ocr"
        ? "Text wird erkannt"
        : "Inhalt wird verstanden";

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(stageLabel);
  }, [stageLabel]);

  useEffect(() => {
    cancelAnimation(uploadLift);
    cancelAnimation(scanProgress);
    cancelAnimation(discoveryProgress);
    uploadLift.set(0);
    scanProgress.set(0.5);
    discoveryProgress.set(1);

    if (reduceMotion) return;

    if (stage === "upload") {
      uploadLift.set(withRepeat(
        withSequence(
          withTiming(-5, { duration: 800, easing: easeInOut }),
          withTiming(0, { duration: 800, easing: easeInOut }),
        ),
        -1,
      ));
    } else if (stage === "ocr") {
      scanProgress.set(0);
      scanProgress.set(withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.linear }),
        -1,
      ));
    } else {
      discoveryProgress.set(0);
      discoveryProgress.set(withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.linear }),
        -1,
      ));
    }

    return () => {
      cancelAnimation(uploadLift);
      cancelAnimation(scanProgress);
      cancelAnimation(discoveryProgress);
    };
  }, [
    discoveryProgress,
    reduceMotion,
    scanProgress,
    stage,
    uploadLift,
  ]);

  const uploadStyle = useAnimatedStyle(() => ({
    opacity: stage === "upload" ? 1 : 0,
    transform: [{ translateY: uploadLift.get() }],
  }));

  const scanStyle = useAnimatedStyle(() => ({
    opacity: stage === "ocr" ? 1 : 0,
    transform: [
      {
        translateY: interpolate(
          scanProgress.get(),
          [0, 1],
          [-35, 35],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View
      accessible
      accessibilityLabel="Verarbeitung"
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityValue={{ text: stageLabel }}
      style={styles.scene}
    >
      <View style={styles.washLarge} />
      <View style={styles.washSmall} />

      <View style={styles.document}>
        <View style={styles.fold} />
        <View style={[styles.documentLine, styles.documentLineLong]} />
        <View style={[styles.documentLine, styles.documentLineMedium]} />
        <View style={[styles.documentLine, styles.documentLineShort]} />
        <Animated.View style={[styles.scanLine, scanStyle]} />
        {stage === "analysis" ? (
          <>
            <DiscoveryDot
              progress={discoveryProgress}
              reduced={reduceMotion}
              range={[0, 0.18, 0.62, 0.82]}
              style={styles.discoveryOne}
            />
            <DiscoveryDot
              progress={discoveryProgress}
              reduced={reduceMotion}
              range={[0.18, 0.36, 0.72, 0.92]}
              style={styles.discoveryTwo}
            />
            <DiscoveryDot
              progress={discoveryProgress}
              reduced={reduceMotion}
              range={[0.36, 0.54, 0.82, 1]}
              style={styles.discoveryThree}
            />
          </>
        ) : null}
      </View>

      <Animated.View style={[styles.uploadBadge, uploadStyle]}>
        <Upload color={colors.warmWhite} size={16} strokeWidth={2.5} />
      </Animated.View>

      <View style={styles.character}>
        <OrdiloCharacter animated processing size={104} />
      </View>
    </View>
  );
}

function DiscoveryDot({
  progress,
  range,
  reduced,
  style,
}: {
  progress: SharedValue<number>;
  range: [number, number, number, number];
  reduced: boolean;
  style: object;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reduced) {
      return { opacity: 1, transform: [{ scale: 1 }] };
    }
    const value = progress.get();
    return {
      opacity: interpolate(
        value,
        range,
        [0, 1, 1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            value,
            range,
            [0.92, 1, 1, 0.96],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return <Animated.View style={[styles.discoveryDot, style, animatedStyle]} />;
}

const styles = StyleSheet.create({
  scene: {
    height: 166,
    position: "relative",
    width: 240,
  },
  washLarge: {
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 136,
    position: "absolute",
    right: 10,
    top: 8,
    width: 136,
  },
  washSmall: {
    backgroundColor: colors.sandWarm,
    borderRadius: radii.pill,
    height: 58,
    left: 20,
    opacity: 0.7,
    position: "absolute",
    top: 18,
    width: 58,
  },
  document: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 116,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 36,
    position: "absolute",
    right: 24,
    top: 14,
    transform: [{ rotate: "3deg" }],
    width: 88,
  },
  fold: {
    backgroundColor: colors.sandWarm,
    borderBottomLeftRadius: 7,
    height: 24,
    position: "absolute",
    right: 0,
    top: 0,
    width: 24,
  },
  documentLine: {
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 5,
    marginBottom: 11,
  },
  documentLineLong: { width: 56 },
  documentLineMedium: { width: 46 },
  documentLineShort: { width: 34 },
  scanLine: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 3,
    left: 7,
    opacity: 0,
    position: "absolute",
    right: 7,
    top: 56,
  },
  uploadBadge: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: colors.warmWhite,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: 38,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 2,
    width: 38,
  },
  character: {
    bottom: 0,
    left: 24,
    position: "absolute",
  },
  discoveryDot: {
    backgroundColor: colors.warmApricot,
    borderColor: colors.warmWhite,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 15,
    position: "absolute",
    width: 15,
  },
  discoveryOne: { right: 10, top: 40 },
  discoveryTwo: { right: 26, top: 64 },
  discoveryThree: { right: 16, top: 88 },
});
