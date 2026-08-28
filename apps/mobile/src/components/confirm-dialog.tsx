import { AlertCircle } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { OrdiloButton } from "./ui";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * The one confirmation dialog for destructive or irreversible actions
 * ("Sammlung löschen", "Notiz löschen", …): a centered warm-white card
 * over a dimmed canvas, with an inline error slot so a failed action
 * keeps the dialog open instead of hiding the failure behind a second
 * alert. Informational alerts keep using the native Alert.
 */
export function ConfirmDialog({
  cancelLabel = "Abbrechen",
  confirmLabel = "Löschen",
  error,
  loading = false,
  loadingLabel = "Einen Moment …",
  message,
  onCancel,
  onConfirm,
  title,
  visible,
}: {
  cancelLabel?: string;
  confirmLabel?: string;
  error?: string | null;
  loading?: boolean;
  loadingLabel?: string;
  /** Pass a string, or inline <Text> to emphasize a name. */
  message: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      transparent
      visible={visible}
    >
      <Pressable
        onPress={loading ? undefined : onCancel}
        style={styles.overlay}
      >
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.dialog}
        >
          <View style={styles.iconCircle}>
            <AlertCircle color={colors.warmWhite} size={20} strokeWidth={2} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{message}</Text>
          {error ? (
            <View accessibilityRole="alert" style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.confirmButton,
              pressed && styles.pressed,
              loading && styles.confirmButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : null}
            <Text style={styles.confirmButtonText}>
              {loading ? loadingLabel : confirmLabel}
            </Text>
          </Pressable>
          <OrdiloButton
            disabled={loading}
            onPress={onCancel}
            size="lg"
            title={cancelLabel}
            variant="outline"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Emphasis for a name inside the dialog message. */
export function ConfirmDialogEmphasis({ children }: { children: ReactNode }) {
  return <Text style={styles.emphasis}>{children}</Text>;
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.warmWhite,
    borderRadius: radii.md,
    gap: spacing.md,
    maxWidth: 420,
    padding: spacing.lg,
    width: "100%",
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.destructive,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: { color: colors.graphite, ...typography.display },
  text: { color: colors.mistDark, ...typography.body },
  emphasis: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
  },
  error: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.sm,
  },
  errorText: { color: colors.destructive, ...typography.timestamp },
  confirmButton: {
    alignItems: "center",
    backgroundColor: colors.destructive,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    height: 48,
    justifyContent: "center",
  },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmButtonText: {
    color: colors.warmWhite,
    fontFamily: typography.title.fontFamily,
    fontSize: typography.body.fontSize,
  },
  pressed: { opacity: 0.76 },
});
