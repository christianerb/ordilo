import type { LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type AnimatedStyle,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { tap } from "@/src/lib/feedback";
import {
  pressDuration,
  pressScale,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Shared UI primitives for the native app, following DESIGN.md:
 * warm-white pages, sand cards, harbor-blue primary actions, and empty
 * states that teach (circle + icon + heading + description + CTA).
 */

/**
 * DESIGN.md Card Rest elevation, expressed for native: iOS gets the
 * ambient warm shadow, Android gets the closest elevation step. Spread
 * onto card styles — never stack on nested cards.
 */
export const cardRestShadow: ViewStyle = {
  elevation: 2,
  shadowColor: "rgba(36, 36, 36, 1)",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const pressTransitionStyle: AnimatedStyle<ViewStyle> = {
  transform: [{ scale: 1 }],
  transitionDuration: pressDuration,
  transitionProperty: "transform",
  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
};
const pressedTransitionStyle: AnimatedStyle<ViewStyle> = {
  transform: [{ scale: pressScale }],
};

/**
 * A Pressable with near-imperceptible physical feedback. Its two-state
 * CSS transition is interruptible without a shared value, stays on the
 * UI runtime, and is skipped under Reduce Motion.
 */
export function SpringPressable({
  children,
  onPress,
  style,
  haptic = true,
  disabled = false,
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = "button",
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
}) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedPressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        if (haptic) tap();
      }}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      style={[
        style,
        pressTransitionStyle,
        pressed && !reduceMotion && pressedTransitionStyle,
        disabled && styles.pressableDisabled,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Loading placeholder: a warm sand block with a calm opacity pulse.
 * The pulse is the only loading motion in the app — it says "content is
 * on its way" without the generic spinner look. Static under
 * reduce-motion.
 */
export function Skeleton({
  width,
  height,
  radius = radii.base,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0.55);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    ));
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { backgroundColor: colors.sandLight, borderRadius: radius, height, width },
        pulseStyle,
        style,
      ]}
    />
  );
}

/** A skeleton in the shape of a standard list card (icon + two lines). */
export function CardSkeleton() {
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      <Skeleton height={40} radius={radii.sm} width={40} />
      <View style={styles.skeletonLines}>
        <Skeleton height={14} width="70%" />
        <Skeleton height={12} width="45%" />
      </View>
    </View>
  );
}

/** A column of card skeletons for full-list loading states. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: rows }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </View>
  );
}

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  action,
  title,
  subtitle,
  trailing,
}: {
  action?: {
    accessibilityLabel: string;
    icon: LucideIcon;
    onPress: () => void;
  };
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const ActionIcon = action?.icon;
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[typography.display, styles.headerTitle]}>{title}</Text>
        {subtitle ? (
          <Text style={[typography.timestamp, styles.headerSubtitle]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (action && ActionIcon ? (
        <SpringPressable
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          style={styles.headerAction}
        >
          <ActionIcon color={colors.warmWhite} size={20} strokeWidth={2.2} />
        </SpringPressable>
      ) : null)}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function OrdiloButton({
  title,
  onPress,
  variant = "primary",
  size = "default",
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost" | "destructive";
  size?: "default" | "lg";
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <SpringPressable
      accessibilityRole="button"
      disabled={disabled}
      haptic={false}
      onPress={onPress}
      style={[
        styles.button,
        size === "lg" ? styles.buttonLg : styles.buttonDefault,
        variant === "primary" && styles.buttonPrimary,
        variant === "outline" && styles.buttonOutline,
        variant === "ghost" && styles.buttonGhost,
        variant === "destructive" && styles.buttonDestructive,
      ]}
    >
      {icon}
      <Text
        style={[
          typography.body,
          styles.buttonText,
          variant === "primary" && styles.buttonTextPrimary,
          variant === "outline" && styles.buttonTextOutline,
          variant === "ghost" && styles.buttonTextGhost,
          variant === "destructive" && styles.buttonTextDestructive,
        ]}
      >
        {title}
      </Text>
    </SpringPressable>
  );
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  children,
}: {
  icon: LucideIcon;
  heading: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Icon color={colors.mist} size={36} strokeWidth={1.5} />
      </View>
      <Text style={[typography.display, styles.emptyHeading]}>{heading}</Text>
      <Text style={[typography.timestamp, styles.emptyDescription]}>
        {description}
      </Text>
      {children ? <View style={styles.emptyCta}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.warmWhite,
    paddingHorizontal: spacing.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.graphite,
  },
  headerSubtitle: {
    color: colors.mistDark,
  },
  headerAction: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  card: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: 12,
    ...cardRestShadow,
  },
  pressableDisabled: {
    opacity: 0.5,
  },
  skeletonCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  skeletonLines: {
    flex: 1,
    gap: 6,
  },
  skeletonList: {
    gap: spacing.sm,
  },
  button: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  buttonDefault: {
    borderRadius: radii.sm,
    height: 36,
    paddingHorizontal: spacing.md,
  },
  buttonLg: {
    borderRadius: radii.md,
    height: 48,
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.harborBlue,
  },
  buttonDestructive: {
    backgroundColor: colors.destructive,
  },
  buttonOutline: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderWidth: 1,
  },
  buttonGhost: {
    backgroundColor: "transparent",
  },
  buttonText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
  },
  buttonTextPrimary: {
    color: colors.warmWhite,
    fontFamily: typography.title.fontFamily,
  },
  buttonTextDestructive: {
    color: colors.warmWhite,
    fontFamily: typography.title.fontFamily,
  },
  buttonTextOutline: {
    color: colors.graphite,
  },
  buttonTextGhost: {
    color: colors.mistDark,
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing["2xl"],
    paddingHorizontal: spacing.lg,
  },
  emptyIconCircle: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    marginBottom: spacing.md,
    width: 80,
  },
  emptyHeading: {
    color: colors.graphite,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  emptyDescription: {
    color: colors.mistDark,
    maxWidth: 280,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: spacing.lg,
  },
});
