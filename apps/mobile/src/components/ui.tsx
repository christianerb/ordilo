import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OrdiloMark } from "@/src/components/ordilo-mark";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Shared UI primitives for the native app, following DESIGN.md:
 * warm-white pages, sand cards, harbor-blue primary actions, and empty
 * states that teach (circle + icon + heading + description + CTA).
 */

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, style]}>
      <View accessible={false} pointerEvents="none" style={styles.ambientLayer}>
        <View style={styles.ambientSage} />
        <View style={styles.ambientBlue} />
        <View style={styles.ambientApricot} />
      </View>
      {children}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View accessible={false} style={[styles.headerDot, styles.headerDotBlue]} />
      <View accessible={false} style={[styles.headerDot, styles.headerDotApricot]} />
      <View style={styles.headerCopy}>
        <Text style={[typography.display, styles.headerTitle]}>{title}</Text>
        {subtitle ? (
          <Text style={[typography.timestamp, styles.headerSubtitle]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View accessible={false} style={styles.headerMark}>
        <OrdiloMark size={42} />
      </View>
      {trailing ? <View style={styles.headerTrailing}>{trailing}</View> : null}
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
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "lg" ? styles.buttonLg : styles.buttonDefault,
        variant === "primary" && styles.buttonPrimary,
        variant === "outline" && styles.buttonOutline,
        variant === "ghost" && styles.buttonGhost,
        variant === "destructive" && styles.buttonDestructive,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
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
          variant === "destructive" && styles.buttonTextPrimary,
        ]}
      >
        {title}
      </Text>
    </Pressable>
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
    position: "relative",
  },
  ambientLayer: {
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  ambientSage: {
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.xl,
    height: 168,
    position: "absolute",
    right: -78,
    top: -72,
    transform: [{ rotate: "12deg" }],
    width: 184,
  },
  ambientBlue: {
    backgroundColor: colors.washBlue,
    borderRadius: radii.pill,
    height: 124,
    left: -82,
    position: "absolute",
    top: "42%",
    width: 124,
  },
  ambientApricot: {
    backgroundColor: colors.washApricot,
    borderRadius: radii.xl,
    bottom: -92,
    height: 156,
    position: "absolute",
    right: 42,
    transform: [{ rotate: "-8deg" }],
    width: 188,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.washSage,
    borderRadius: radii.md,
    flexDirection: "row",
    marginTop: spacing.md,
    minHeight: 90,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    position: "relative",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.harborBlueDarker,
  },
  headerSubtitle: {
    color: colors.harborBlueDarker,
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: radii.pill,
    height: 52,
    justifyContent: "center",
    marginLeft: spacing.sm,
    width: 52,
  },
  headerTrailing: {
    marginLeft: spacing.xs,
  },
  headerDot: {
    borderRadius: radii.pill,
    position: "absolute",
  },
  headerDotBlue: {
    backgroundColor: colors.washBlue,
    height: 48,
    right: 56,
    top: -21,
    width: 48,
  },
  headerDotApricot: {
    backgroundColor: colors.washApricot,
    bottom: -17,
    height: 38,
    left: 28,
    width: 38,
  },
  card: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: 12,
  },
  button: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  buttonDefault: {
    borderRadius: radii.sm,
    minHeight: 44,
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
  buttonOutline: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderWidth: 1,
  },
  buttonGhost: {
    backgroundColor: "transparent",
  },
  buttonDestructive: {
    backgroundColor: colors.destructive,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
  },
  buttonTextPrimary: {
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
