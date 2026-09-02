import { ChevronLeft, type LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  cubicBezier,
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

import { OrdiloMark } from "./ordilo-mark";

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
const PRESS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const pressTransitionStyle: AnimatedStyle<ViewStyle> = {
  transform: [{ scale: 1 }],
  transitionDuration: pressDuration,
  transitionProperty: "transform",
  transitionTimingFunction: PRESS_EASE_OUT,
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

/**
 * The one compact screen header for every tab: a bordered journal card
 * with quiet landscape washes, the Ordilo mark, and an optional action.
 * Its outer measurements never vary between screens.
 */
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
    tone?: "primary" | "quiet";
  };
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const ActionIcon = action?.icon;
  const hasAction = Boolean(action || trailing);
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.header}>
      <View accessible={false} style={styles.headerWashOne} />
      <View accessible={false} style={styles.headerWashTwo} />
      <View accessible={false} style={styles.headerDotOne} />
      <View accessible={false} style={styles.headerDotTwo} />
      <View
        style={[
          styles.headerCopy,
          hasAction ? styles.headerCopyWithAction : styles.headerCopyWithoutAction,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            typography.display,
            styles.headerTitle,
            { lineHeight: typography.display.lineHeight * fontScale },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[
              typography.timestamp,
              styles.headerSubtitle,
              { lineHeight: typography.timestamp.lineHeight * fontScale },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View pointerEvents="box-none" style={styles.headerActionSlot}>
        {trailing ?? (action && ActionIcon ? (
          <SpringPressable
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={[
              styles.headerAction,
              action.tone === "quiet"
                ? styles.headerActionQuiet
                : styles.headerActionPrimary,
            ]}
          >
            <ActionIcon
              color={
                action.tone === "quiet"
                  ? colors.harborBlue
                  : colors.warmWhite
              }
              size={20}
              strokeWidth={2.1}
            />
          </SpringPressable>
        ) : null)}
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.headerMark}
      >
        <OrdiloMark size={42} />
      </View>
    </View>
  );
}

/**
 * The one view switcher (Dokumente/Notizen, Aufgaben/Termine): a sand
 * track where the active segment fills in harbor blue.
 */
export function SegmentedControl({
  items,
  style,
}: {
  items: readonly {
    icon: LucideIcon;
    label: string;
    onPress: () => void;
    selected: boolean;
  }[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: item.selected }}
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.segment,
              item.selected && styles.segmentSelected,
              pressed && styles.segmentPressed,
            ]}
          >
            <ItemIcon
              color={item.selected ? colors.warmWhite : colors.mistDark}
              size={17}
            />
            <Text
              style={[
                styles.segmentText,
                item.selected && styles.segmentTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The one top bar for detail and stack screens: back chevron on the
 * left, optional title and subtitle beside it, optional actions on the
 * right. List screens that show a ScreenHeader pass no title.
 */
export function DetailTopBar({
  onBack,
  title,
  subtitle,
  trailing,
}: {
  onBack: () => void;
  title?: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.detailTopBar}>
      <SpringPressable
        accessibilityLabel="Zurück"
        onPress={onBack}
        style={styles.detailBack}
      >
        <ChevronLeft color={colors.graphite} size={22} strokeWidth={2} />
      </SpringPressable>
      {title ? (
        <View style={styles.detailTopCopy}>
          <Text numberOfLines={1} style={styles.detailTopTitle}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.detailTopSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {trailing}
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
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    // The mark defines the compact default, while larger system text can
    // grow the header instead of being clipped by a fixed height.
    minHeight: 80,
    // Top-aligned like the mark (top: 14) and the action slot beside it —
    // the copy, the button and the mark share one top edge.
    justifyContent: "flex-start",
    marginTop: spacing.sm,
    overflow: "hidden",
    padding: 14,
    ...cardRestShadow,
  },
  headerWashOne: {
    backgroundColor: colors.washSage,
    borderRadius: radii.pill,
    bottom: -65,
    height: 94,
    left: -34,
    opacity: 0.88,
    position: "absolute",
    transform: [{ rotate: "7deg" }],
    width: 235,
  },
  headerWashTwo: {
    backgroundColor: colors.washApricot,
    borderRadius: radii.pill,
    bottom: -69,
    height: 96,
    opacity: 0.96,
    position: "absolute",
    right: -26,
    transform: [{ rotate: "-8deg" }],
    width: 218,
  },
  headerDotOne: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 6,
    opacity: 0.16,
    position: "absolute",
    right: 130,
    top: 17,
    width: 6,
  },
  headerDotTwo: {
    backgroundColor: colors.warmApricot,
    borderRadius: radii.pill,
    height: 7,
    opacity: 0.32,
    position: "absolute",
    right: 117,
    top: 10,
    width: 7,
  },
  headerCopy: {
    gap: 4,
    zIndex: 1,
  },
  headerCopyWithAction: { paddingRight: 116 },
  headerCopyWithoutAction: { paddingRight: 62 },
  headerTitle: {
    color: colors.graphite,
  },
  headerSubtitle: {
    color: colors.mistDark,
  },
  headerActionSlot: {
    position: "absolute",
    right: 76,
    // Same top edge as the copy padding and the mark (14).
    top: 14,
    zIndex: 1,
  },
  headerAction: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerActionPrimary: {
    backgroundColor: colors.harborBlue,
  },
  headerActionQuiet: {
    backgroundColor: colors.washSage,
    borderColor: colors.mistLight,
    borderWidth: 1,
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    height: 52,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    shadowColor: colors.graphite,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    top: 14,
    width: 52,
  },
  segmented: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    padding: spacing.xs,
  },
  segment: {
    alignItems: "center",
    borderRadius: radii.base,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    height: 40,
    justifyContent: "center",
  },
  segmentSelected: { backgroundColor: colors.harborBlue },
  segmentPressed: { opacity: 0.76 },
  segmentText: { color: colors.mistDark, ...typography.label },
  segmentTextSelected: { color: colors.warmWhite },
  detailTopBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 60,
    paddingHorizontal: spacing.sm,
  },
  detailBack: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  detailTopCopy: { flex: 1, gap: 2, minWidth: 0 },
  detailTopTitle: { color: colors.graphite, ...typography.title },
  detailTopSubtitle: { color: colors.mistDark, ...typography.timestamp },
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
