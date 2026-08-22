/* eslint-disable react-hooks/immutability --
   Reanimated shared values are mutable by design: `.value` proxies to the
   UI thread and is written from event handlers, never during render. The
   rule's render-scope immutability assumption does not apply here. */
import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { haptics } from "@/src/lib/haptics";
import { motion, REDUCE_MOTION, staggerDelay } from "@/src/lib/motion";

/**
 * Motion components for the native app. All of them honour iOS Reduce
 * Motion via REDUCE_MOTION — movement collapses to a plain fade, so no
 * screen ever depends on animation to be understood.
 */

/**
 * A Pressable that breathes: slight scale-down on touch, springy return,
 * light haptic on contact. The default touch feedback for anything that
 * navigates or commits (rows, cards, icon buttons).
 */
export function PressableScale({
  accessibilityLabel,
  accessibilityRole = "button",
  children,
  contentStyle,
  disabled = false,
  haptic = true,
  onPress,
  scaleTo = 0.965,
  style,
}: {
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Set false for toggles that already fire `haptics.selection()`. */
  haptic?: boolean;
  onPress: () => void;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        // Haptic on contact, not on release — it should feel like the
        // button answers the finger, not the other way around.
        if (haptic) haptics.tap();
        scale.value = withSpring(scaleTo, motion.spring.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      style={style}
    >
      <Animated.View style={[contentStyle, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Entrance animation for screens and sections: rises gently into place
 * with a spring. Pass `index` for staggered groups.
 */
export function FadeInView({
  children,
  delay = 0,
  from = "down",
  index,
  style,
}: {
  children: ReactNode;
  delay?: number;
  from?: "down" | "up";
  /** Position in a staggered group — overrides `delay` when set. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const resolvedDelay = index !== undefined ? staggerDelay(index) : delay;
  const entering = (from === "down" ? FadeInDown : FadeInUp)
    .delay(resolvedDelay)
    .springify()
    .damping(motion.spring.gentle.damping)
    .stiffness(motion.spring.gentle.stiffness)
    .reduceMotion(REDUCE_MOTION);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
