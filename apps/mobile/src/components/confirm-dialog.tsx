import { AlertCircle } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  OrdiloFormFooter,
  OrdiloNestedSheet,
  OrdiloSheetHeader,
} from "./sheet";
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
  contained = false,
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
  contained?: boolean;
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
    <OrdiloNestedSheet
      closeAccessibilityLabel="Bestätigung schließen"
      contained={contained}
      dismissDisabled={loading}
      onClose={onCancel}
      visible={visible}
    >
      <View style={styles.content}>
        <OrdiloSheetHeader title={title} />
        <View style={styles.message}>
          <View style={styles.iconCircle}>
            <AlertCircle color={colors.warmWhite} size={20} strokeWidth={2} />
          </View>
          <Text style={styles.text}>{message}</Text>
        </View>
        <OrdiloFormFooter
          error={error}
          primary={<OrdiloButton
            disabled={loading}
            icon={loading ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
            onPress={onConfirm}
            size="lg"
            title={loading ? loadingLabel : confirmLabel}
            variant="destructive"
          />}
          secondary={<OrdiloButton
            disabled={loading}
            onPress={onCancel}
            size="lg"
            title={cancelLabel}
            variant="outline"
          />}
        />
      </View>
    </OrdiloNestedSheet>
  );
}

/** Emphasis for a name inside the dialog message. */
export function ConfirmDialogEmphasis({ children }: { children: ReactNode }) {
  return <Text style={styles.emphasis}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  message: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.destructive,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  text: { color: colors.mistDark, flex: 1, ...typography.body },
  emphasis: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
  },
});
