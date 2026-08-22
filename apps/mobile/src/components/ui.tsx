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
      {children}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.header}>
      <Text style={[typography.display, styles.headerTitle]}>{title}</Text>
      {subtitle ? (
        <Text style={[typography.timestamp, styles.headerSubtitle]}>
          {subtitle}
        </Text>
      ) : null}
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
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.graphite,
  },
  headerSubtitle: {
    color: colors.mistDark,
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
