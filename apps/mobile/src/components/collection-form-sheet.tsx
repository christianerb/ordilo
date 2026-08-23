import { Check } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { OrdiloButton } from "./ui";
import { CollectionIcon } from "./collection-icon";
import {
  COLLECTION_COLOR_OPTIONS,
  COLLECTION_ICON_OPTIONS,
  DEFAULT_COLLECTION_ICON_KEY,
  validateCollectionInput,
  type CollectionInput,
} from "@/src/lib/collections";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export type CollectionFormSubmit = (
  values: CollectionInput,
) => Promise<{ success: boolean; error?: string }>;

/**
 * Bottom-sheet form for creating or editing a collection ("Sammlung").
 * Choosing a name, an icon and a color is one decision, so the sheet
 * keeps everything on one thumb-reachable surface. Local validation and
 * server errors share the same inline slot with identical German copy.
 */
export function CollectionFormSheet({
  initialValues,
  onClose,
  onSubmit,
  submitLabel,
  title,
  visible,
}: {
  initialValues?: CollectionInput;
  onClose: () => void;
  onSubmit: CollectionFormSubmit;
  submitLabel: string;
  title: string;
  visible: boolean;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [icon, setIcon] = useState(initialValues?.icon ?? DEFAULT_COLLECTION_ICON_KEY);
  const [color, setColor] = useState(initialValues?.color ?? "petrol");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  // Re-seed the draft every time the sheet opens so a stale edit never
  // leaks into the next create (and vice versa). Render-time adjustment
  // instead of an effect — the official pattern for derived resets.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(initialValues?.name ?? "");
      setIcon(initialValues?.icon ?? DEFAULT_COLLECTION_ICON_KEY);
      setColor(initialValues?.color ?? "petrol");
      setError(null);
      setSubmitting(false);
      setNameFocused(false);
    }
  }

  const submit = useCallback(async () => {
    const validation = validateCollectionInput({ name, icon, color });
    if (!validation.success) {
      setError(validation.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(validation.data);
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.");
      }
    } catch {
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch's nochmal.");
    } finally {
      setSubmitting(false);
    }
  }, [color, icon, name, onClose, onSubmit]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.overlay}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              accessibilityLabel="Name der Sammlung"
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={50}
              onBlur={() => setNameFocused(false)}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              onFocus={() => setNameFocused(true)}
              placeholder="Zum Beispiel: Rechnungen"
              placeholderTextColor={colors.mistDark}
              returnKeyType="done"
              style={[styles.input, nameFocused && styles.inputFocused]}
              value={name}
            />

            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {COLLECTION_ICON_OPTIONS.map((option) => {
                const selected = icon === option.key;
                return (
                  <Pressable
                    accessibilityLabel={`Icon ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.key}
                    onPress={() => setIcon(option.key)}
                    style={[styles.iconCell, selected && styles.iconCellSelected]}
                  >
                    <CollectionIcon
                      iconKey={option.key}
                      color={selected ? colors.harborBlue : colors.mistDark}
                      size={22}
                      strokeWidth={1.8}
                    />
                    <Text
                      numberOfLines={1}
                      style={[styles.iconLabel, selected && styles.iconLabelSelected]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Farbe</Text>
            <View style={styles.colorRow}>
              {COLLECTION_COLOR_OPTIONS.map((option) => {
                const selected = color === option.key;
                return (
                  <Pressable
                    accessibilityLabel={`Farbe ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.key}
                    onPress={() => setColor(option.key)}
                    style={[styles.colorCell, selected && styles.colorCellSelected]}
                  >
                    <View style={[styles.colorDot, { backgroundColor: option.bg }]}>
                      {selected ? <Check color={option.fg} size={18} strokeWidth={2.4} /> : null}
                    </View>
                    <Text style={[styles.colorLabel, selected && styles.iconLabelSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.submit}>
              <OrdiloButton
                disabled={submitting}
                icon={
                  submitting ? (
                    <ActivityIndicator color={colors.warmWhite} size="small" />
                  ) : undefined
                }
                onPress={() => void submit()}
                size="lg"
                title={submitting ? "Wird gespeichert …" : submitLabel}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    width: 40,
  },
  title: {
    color: colors.graphite,
    marginBottom: spacing.md,
    ...typography.display,
  },
  fieldLabel: {
    color: colors.mistDark,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    ...typography.label,
  },
  input: {
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    height: 44,
    paddingHorizontal: 12,
    ...typography.body,
  },
  inputFocused: {
    borderColor: colors.harborBlue,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  iconCell: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexBasis: "18%",
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 64,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  iconCellSelected: {
    backgroundColor: "rgba(48, 84, 96, 0.08)",
    borderColor: colors.harborBlue,
  },
  iconLabel: {
    color: colors.mistDark,
    ...typography.label,
  },
  iconLabelSelected: {
    color: colors.harborBlue,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  colorCell: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 64,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  colorCellSelected: {
    borderColor: colors.harborBlue,
  },
  colorDot: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  colorLabel: {
    color: colors.mistDark,
    ...typography.label,
  },
  errorBox: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    ...typography.timestamp,
  },
  submit: {
    marginTop: spacing.lg,
  },
});
