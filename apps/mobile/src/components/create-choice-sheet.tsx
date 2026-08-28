import { ChevronRight, Sprout, type LucideIcon } from "lucide-react-native";
import { forwardRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OrdiloSheet, type OrdiloSheetHandle } from "./sheet";
import { cardRestShadow } from "./ui";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export interface CreateChoiceItem {
  accessibilityLabel: string;
  description: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tint?: "sage" | "apricot" | "sand" | "blue";
}

export const CreateChoiceSheet = forwardRef<
  OrdiloSheetHandle,
  {
    accessibilityLabel: string;
    items: CreateChoiceItem[];
    onDismiss: () => void;
  }
>(function CreateChoiceSheet(
  { accessibilityLabel, items, onDismiss },
  ref,
) {
  return (
    <OrdiloSheet
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.sheetContent}
      detached
      onDismiss={onDismiss}
      ref={ref}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Was möchtest du anlegen?</Text>
          <Text style={styles.subtitle}>
            Wähle aus, was du jetzt festhalten möchtest.
          </Text>
        </View>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.decoration}
        >
          <View style={styles.decorationWash} />
          <View style={styles.decorationDot} />
          <Sprout color={colors.harborBlue} size={34} strokeWidth={1.35} />
        </View>
      </View>

      <View style={styles.options}>
        {items.map((item) => (
          <CreateChoiceRow item={item} key={item.label} />
        ))}
      </View>
    </OrdiloSheet>
  );
});

function CreateChoiceRow({ item }: { item: CreateChoiceItem }) {
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityHint={item.description}
      accessibilityLabel={item.accessibilityLabel}
      accessibilityRole="button"
      onPress={item.onPress}
      style={({ pressed }) => [
        styles.option,
        pressed && styles.optionPressed,
      ]}
    >
      <View
        style={[
          styles.optionIcon,
          item.tint === "apricot" && styles.optionIconApricot,
          item.tint === "sand" && styles.optionIconSand,
          item.tint === "blue" && styles.optionIconBlue,
        ]}
      >
        <Icon color={colors.harborBlueDarker} size={25} strokeWidth={1.65} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{item.label}</Text>
        <Text numberOfLines={2} style={styles.optionDescription}>
          {item.description}
        </Text>
      </View>
      <View style={styles.optionArrow}>
        <ChevronRight color={colors.mistDark} size={20} strokeWidth={1.8} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    minHeight: 112,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  headerCopy: {
    gap: spacing.xs,
    paddingRight: 82,
    zIndex: 1,
  },
  title: {
    color: colors.harborBlueDarker,
    ...typography.display,
    fontSize: 21,
    lineHeight: 27,
  },
  subtitle: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  decoration: {
    alignItems: "center",
    height: 72,
    justifyContent: "center",
    position: "absolute",
    right: spacing.sm,
    top: 0,
    width: 72,
  },
  decorationWash: {
    backgroundColor: colors.washApricot,
    borderRadius: radii.pill,
    height: 66,
    opacity: 0.7,
    position: "absolute",
    right: -22,
    top: 5,
    width: 66,
  },
  decorationDot: {
    backgroundColor: colors.warmApricotLight,
    borderRadius: radii.pill,
    bottom: 8,
    height: 9,
    left: 5,
    position: "absolute",
    width: 9,
  },
  options: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  option: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 86,
    padding: 12,
    ...cardRestShadow,
  },
  optionPressed: {
    backgroundColor: colors.sandWarm,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderColor: "rgba(48, 84, 96, 0.12)",
    borderRadius: 16,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  optionIconApricot: {
    backgroundColor: colors.washApricot,
    borderColor: "rgba(228, 96, 24, 0.16)",
  },
  optionIconSand: {
    backgroundColor: colors.sandLight,
    borderColor: colors.mistLight,
  },
  optionIconBlue: {
    backgroundColor: colors.washBlue,
    borderColor: "rgba(48, 84, 96, 0.12)",
  },
  optionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  optionTitle: {
    color: colors.graphite,
    ...typography.title,
  },
  optionDescription: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  optionArrow: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
});
