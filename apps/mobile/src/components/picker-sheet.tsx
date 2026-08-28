import type { ReactNode } from "react";
import { Check } from "lucide-react-native";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  OrdiloNestedSheet,
  OrdiloSheet,
  OrdiloSheetHeader,
  useSheetPresentation,
} from "@/src/components/sheet";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export interface OrdiloPickerOption {
  accessibilityLabel?: string;
  hint?: string;
  key: string;
  label: string;
  leading?: ReactNode;
  onPress: () => void;
  selected?: boolean;
}

export function OrdiloPickerSheet({
  accessibilityLabel,
  onClose,
  options,
  title,
  visible,
}: {
  accessibilityLabel: string;
  onClose: () => void;
  options: OrdiloPickerOption[];
  title: string;
  visible: boolean;
}) {
  const sheetRef = useSheetPresentation(visible);

  return (
    <OrdiloSheet
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.content}
      detached
      onDismiss={onClose}
      ref={sheetRef}
    >
      <PickerContent options={options} title={title} />
    </OrdiloSheet>
  );
}

export function OrdiloPickerOverlay({
  onClose,
  options,
  title,
  visible,
}: {
  onClose: () => void;
  options: OrdiloPickerOption[];
  title: string;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <OrdiloNestedSheet
      contained
      onClose={onClose}
      visible={visible}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PickerContent options={options} title={title} />
      </ScrollView>
    </OrdiloNestedSheet>
  );
}

function PickerContent({
  options,
  title,
}: {
  options: OrdiloPickerOption[];
  title: string;
}) {
  return (
    <>
      <OrdiloSheetHeader title={title} />
      <View style={styles.list}>
        {options.map((option, index) => (
          <Pressable
            accessibilityHint={option.hint}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: option.selected }}
            key={option.key}
            onPress={option.onPress}
            style={({ pressed }) => [
              styles.row,
              option.selected && styles.rowSelected,
              index < options.length - 1 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}
          >
            {option.leading}
            <View style={styles.copy}>
              <Text
                style={[
                  styles.label,
                  option.selected && styles.labelSelected,
                ]}
              >
                {option.label}
              </Text>
              {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
            </View>
            {option.selected ? (
              <Check color={colors.harborBlue} size={19} strokeWidth={2.4} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  list: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomColor: colors.mistLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowSelected: {
    backgroundColor: "rgba(48, 84, 96, 0.08)",
  },
  rowPressed: {
    backgroundColor: colors.sandWarm,
  },
  copy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  label: {
    color: colors.graphite,
    ...typography.title,
  },
  labelSelected: {
    color: colors.harborBlue,
  },
  hint: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
});
