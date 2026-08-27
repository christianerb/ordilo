import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { colors, spacing, typography } from "@/src/theme/tokens";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

function project(velocity: number, decelerationRate = 0.998) {
  "worklet";
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  "worklet";
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/**
 * One animation owner for full-screen image previews. A downward flick or
 * drag dismisses with velocity handoff; Reduce Motion keeps only opacity.
 */
export function SwipeImagePreview({
  imageAccessibilityLabel = "Originaldokument",
  imageUrl,
  onClose,
  title = "Original",
}: {
  imageAccessibilityLabel?: string;
  imageUrl: string;
  onClose: () => void;
  title?: string;
}) {
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(reduceMotion ? 0 : height);
  const dragStart = useSharedValue(0);
  const opacity = useSharedValue(0);
  const closing = useSharedValue(false);

  const finishClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    opacity.set(
      withTiming(1, {
        duration: reduceMotion ? 150 : 220,
        easing: EASE_OUT,
        reduceMotion: ReduceMotion.Never,
      }),
    );
    if (!reduceMotion) {
      translateY.set(
        withSpring(0, {
          dampingRatio: 1,
          duration: 300,
          overshootClamping: true,
        }),
      );
    }
  }, [opacity, reduceMotion, translateY]);

  const requestClose = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    opacity.set(
      withTiming(
        0,
        {
          duration: 150,
          easing: EASE_OUT,
          reduceMotion: ReduceMotion.Never,
        },
        reduceMotion
          ? (finished) => {
              if (finished) scheduleOnRN(finishClose);
            }
          : undefined,
      ),
    );
    if (!reduceMotion) {
      translateY.set(
        withSpring(
          height,
          {
            dampingRatio: 1,
            duration: 300,
            overshootClamping: true,
          },
          (finished) => {
            if (finished) scheduleOnRN(finishClose);
          },
        ),
      );
    }
  }, [closing, finishClose, height, opacity, reduceMotion, translateY]);

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .onStart(() => {
          if (closing.get()) return;
          dragStart.set(translateY.get());
        })
        .onUpdate((event) => {
          if (closing.get()) return;
          const distance = Math.max(0, event.translationY);
          opacity.set(Math.max(0.35, 1 - distance / (height * 0.7)));
          if (reduceMotion) return;

          const next = dragStart.get() + event.translationY;
          translateY.set(next >= 0 ? next : rubberband(next, height));
        })
        .onEnd((event) => {
          if (closing.get()) return;
          const projected = reduceMotion
            ? event.translationY + project(event.velocityY)
            : translateY.get() + project(event.velocityY);
          if (projected > height * 0.4) {
            closing.set(true);
            opacity.set(
              withTiming(
                0,
                {
                  duration: 150,
                  easing: EASE_OUT,
                  reduceMotion: ReduceMotion.Never,
                },
                reduceMotion
                  ? (finished) => {
                      if (finished) scheduleOnRN(finishClose);
                    }
                  : undefined,
              ),
            );
            scheduleOnRN(
              Haptics.impactAsync,
              Haptics.ImpactFeedbackStyle.Light,
            );
            if (!reduceMotion) {
              translateY.set(
                withSpring(
                  height,
                  {
                    dampingRatio: 1,
                    duration: 300,
                    overshootClamping: true,
                    velocity: event.velocityY,
                  },
                  (finished) => {
                    if (finished) scheduleOnRN(finishClose);
                  },
                ),
              );
            }
          } else if (reduceMotion) {
            opacity.set(
              withTiming(1, {
                duration: 150,
                easing: EASE_OUT,
                reduceMotion: ReduceMotion.Never,
              }),
            );
          } else {
            translateY.set(
              withSpring(0, {
                dampingRatio: 0.8,
                duration: 300,
                velocity: event.velocityY,
              }),
            );
            opacity.set(
              withTiming(1, {
                duration: 150,
                easing: EASE_OUT,
                reduceMotion: ReduceMotion.Never,
              }),
            );
          }
        }),
    [
      closing,
      dragStart,
      finishClose,
      height,
      opacity,
      reduceMotion,
      translateY,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }],
  }));

  return (
    <Modal
      animationType="none"
      onRequestClose={requestClose}
      presentationStyle="fullScreen"
      visible
    >
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.preview, animatedStyle]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityLabel="Original schließen"
              accessibilityRole="button"
              onPress={requestClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>Fertig</Text>
            </Pressable>
          </View>
          <Image
            accessibilityLabel={imageAccessibilityLabel}
            resizeMode="contain"
            source={{ uri: imageUrl }}
            style={styles.image}
          />
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: colors.warmWhite, flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  title: { color: colors.graphite, ...typography.title },
  closeButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  closeText: { color: colors.harborBlue, ...typography.title },
  image: { flex: 1, height: undefined, width: "100%" },
});
