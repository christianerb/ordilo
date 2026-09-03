import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react-native";
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
import { colors, radii, sizes, spacing, typography } from "@/src/theme/tokens";

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
 * The one screen header: a large, quiet title with an optional eyebrow
 * (date, count) and subtitle, plus room on the right for one action or
 * a custom control (the family faces on Start). No card, no border —
 * the title is the header, like a well-made iOS app. Text scales with
 * the system font size instead of clipping.
 */
export function ScreenHeader({
  action,
  eyebrow,
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
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? (
          <Text
            numberOfLines={1}
            style={[
              typography.caption,
              styles.headerEyebrow,
              { lineHeight: typography.caption.lineHeight * fontScale },
            ]}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          numberOfLines={2}
          style={[
            typography.largeTitle,
            styles.headerTitle,
            { lineHeight: typography.largeTitle.lineHeight * fontScale },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
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
      {trailing ? (
        <View style={styles.headerTrailing}>{trailing}</View>
      ) : action ? (
        <View style={styles.headerTrailing}>
          <IconButton
            accessibilityLabel={action.accessibilityLabel}
            icon={action.icon}
            onPress={action.onPress}
            tone={action.tone ?? "primary"}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The one round icon button: 44pt target, three tones. Primary is the
 * screen's single main action, quiet is a secondary control, plain sits
 * inside toolbars.
 */
export function IconButton({
  accessibilityLabel,
  accessibilityHint,
  icon: Icon,
  onPress,
  tone = "quiet",
  disabled = false,
  size = sizes.touch,
}: {
  accessibilityLabel: string;
  accessibilityHint?: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: "primary" | "quiet" | "plain";
  disabled?: boolean;
  size?: number;
}) {
  const color =
    tone === "primary"
      ? colors.warmWhite
      : tone === "quiet"
        ? colors.harborBlue
        : colors.graphite;
  return (
    <SpringPressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.iconButton,
        { borderRadius: size / 2, height: size, width: size },
        tone === "primary" && styles.iconButtonPrimary,
        tone === "quiet" && styles.iconButtonQuiet,
      ]}
    >
      <Icon color={color} size={20} strokeWidth={2} />
    </SpringPressable>
  );
}

/**
 * A section heading inside a scrolling screen: title on the left, an
 * optional count or hint beside it, an optional text action on the right.
 */
export function SectionHeader({
  action,
  count,
  hint,
  title,
}: {
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  count?: number;
  hint?: string;
  title: string;
}) {
  return (
    <View accessibilityRole="header" style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text numberOfLines={1} style={styles.sectionTitle}>
          {title}
        </Text>
        {typeof count === "number" ? (
          <Text style={styles.sectionCount}>{count}</Text>
        ) : null}
        {hint ? (
          <Text numberOfLines={1} style={styles.sectionHint}>
            {hint}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          accessibilityRole="button"
          hitSlop={8}
          onPress={action.onPress}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.pressedOpacity]}
        >
          <Text style={styles.sectionActionText}>{action.label}</Text>
          <ChevronRight color={colors.harborBlue} size={16} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The grouped list surface: one rounded sand card whose rows are divided
 * by hairlines. Rows go inside as children; use ListRow for the standard
 * anatomy.
 */
export function ListGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.listGroup, style]}>{children}</View>;
}

/**
 * The standard row: leading tile or avatar, title, up to two supporting
 * lines, trailing element. Pressable when onPress is given. Keeps a 56pt
 * minimum so a row is always a comfortable target.
 */
export function ListRow({
  accessibilityHint,
  accessibilityLabel,
  first = false,
  leading,
  meta,
  onPress,
  subtitle,
  title,
  titleLines = 1,
  trailing,
  chevron = false,
  muted = false,
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  /** First row in a group draws no top hairline. */
  first?: boolean;
  leading?: ReactNode;
  /** Small caption below the subtitle (due label, date). */
  meta?: ReactNode;
  onPress?: () => void;
  subtitle?: string | null;
  title: string;
  titleLines?: number;
  trailing?: ReactNode;
  chevron?: boolean;
  muted?: boolean;
}) {
  const content = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowCopy}>
        <Text
          numberOfLines={titleLines}
          style={[styles.rowTitle, muted && styles.rowTitleMuted]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <View style={styles.rowMeta}>{meta}</View> : null}
      </View>
      {trailing ? <View style={styles.rowTrailing}>{trailing}</View> : null}
      {chevron ? (
        <ChevronRight color={colors.mist} size={18} strokeWidth={2} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.row, !first && styles.rowDivider]}>{content}</View>
    );
  }
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

/** The leading square tile that carries an icon on a row. */
export function IconTile({
  children,
  size = sizes.tile,
  tint = colors.sandLight,
  style,
}: {
  children: ReactNode;
  size?: number;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.iconTile,
        { backgroundColor: tint, borderRadius: Math.round(size * 0.3), height: size, width: size },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Selectable pill — filters, presets, suggestions. */
export function Chip({
  accessibilityLabel,
  icon: Icon,
  label,
  onPress,
  selected = false,
  tone = "neutral",
}: {
  accessibilityLabel?: string;
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  tone?: "neutral" | "attention";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        tone === "attention" && !selected && styles.chipAttention,
        pressed && styles.pressedOpacity,
      ]}
    >
      {Icon ? (
        <Icon
          color={selected ? colors.warmWhite : tone === "attention" ? colors.warmApricot : colors.mistDark}
          size={15}
          strokeWidth={2}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.chipText,
          selected && styles.chipTextSelected,
          tone === "attention" && !selected && styles.chipTextAttention,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Inline, dismissible problem line for a screen that still has content. */
export function InlineNotice({
  actionLabel,
  message,
  onAction,
  tone = "error",
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  tone?: "error" | "info";
}) {
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[styles.notice, tone === "info" && styles.noticeInfo]}
    >
      <Text style={[styles.noticeText, tone === "info" && styles.noticeTextInfo]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction}>
          <Text style={[styles.noticeAction, tone === "info" && styles.noticeTextInfo]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
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
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 80,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingTop: 2,
  },
  headerEyebrow: {
    color: colors.mistDark,
  },
  headerTitle: {
    color: colors.graphite,
  },
  headerSubtitle: {
    color: colors.mistDark,
    marginTop: 2,
  },
  headerTrailing: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPrimary: {
    backgroundColor: colors.harborBlue,
  },
  iconButtonQuiet: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderWidth: 1,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 32,
    paddingHorizontal: spacing.xs,
  },
  sectionHeaderCopy: {
    alignItems: "baseline",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  sectionTitle: {
    color: colors.graphite,
    flexShrink: 1,
    ...typography.display,
  },
  sectionCount: {
    color: colors.mistDark,
    ...typography.caption,
  },
  sectionHint: {
    color: colors.mistDark,
    flexShrink: 1,
    ...typography.timestamp,
  },
  sectionAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minHeight: 32,
    paddingLeft: spacing.sm,
  },
  sectionActionText: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  pressedOpacity: {
    opacity: 0.7,
  },
  listGroup: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    backgroundColor: colors.sandWarm,
  },
  rowLeading: {
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.graphite,
    ...typography.title,
  },
  rowTitleMuted: {
    color: colors.mistDark,
    textDecorationLine: "line-through",
  },
  rowSubtitle: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  rowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2,
  },
  rowTrailing: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  iconTile: {
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  chipAttention: {
    backgroundColor: colors.washApricot,
    borderColor: "rgba(228, 96, 24, 0.25)",
  },
  chipText: {
    color: colors.mistDark,
    ...typography.caption,
  },
  chipTextSelected: {
    color: colors.warmWhite,
  },
  chipTextAttention: {
    color: "#9A4A12",
  },
  notice: {
    alignItems: "center",
    backgroundColor: colors.destructiveBackground,
    borderColor: "rgba(192, 57, 43, 0.25)",
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: 12,
  },
  noticeInfo: {
    backgroundColor: colors.washSageSoft,
    borderColor: colors.mistLight,
  },
  noticeText: {
    color: colors.destructive,
    flex: 1,
    ...typography.timestamp,
  },
  noticeTextInfo: {
    color: colors.graphite,
  },
  noticeAction: {
    color: colors.destructive,
    ...typography.caption,
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
