import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { forwardRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  OrdiloSheet,
  OrdiloSheetHeader,
  type OrdiloSheetHandle,
} from "./sheet";
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
    subtitle?: string;
    title?: string;
  }
>(function CreateChoiceSheet(
  {
    accessibilityLabel,
    items,
    onDismiss,
    subtitle = "Wähle aus, was du jetzt festhalten möchtest.",
    title = "Was möchtest du anlegen?",
  },
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
      <OrdiloSheetHeader subtitle={subtitle} title={title} />

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
  options: {
    gap: spacing.md,
    paddingBottom: spacing.md,
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
