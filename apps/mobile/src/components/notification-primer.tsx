import { BellRing } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import {
  OrdiloSheet,
  OrdiloSheetHeader,
  useSheetPresentation,
} from "@/src/components/sheet";
import { OrdiloButton } from "@/src/components/ui";
import { colors, radii, spacing } from "@/src/theme/tokens";

/**
 * The one-time notification primer. Instead of asking at first launch it
 * appears when the value just became real — the family's first processed
 * document. One warm sentence, one decision: "Mitteilungen erlauben" asks
 * the OS, "Später" is an answer too, and the sheet never comes back.
 * Swiping it away counts as "Später".
 */
export function NotificationPrimer({
  busy = false,
  onAllow,
  onLater,
  visible,
}: {
  busy?: boolean;
  onAllow: () => void;
  onLater: () => void;
  visible: boolean;
}) {
  const sheetRef = useSheetPresentation(visible);

  return (
    <OrdiloSheet
      accessibilityLabel="Mitteilungen erlauben"
      contentContainerStyle={styles.content}
      onDismiss={onLater}
      ref={sheetRef}
    >
      <View style={styles.iconWrap}>
        <BellRing color={colors.harborBlue} size={26} strokeWidth={1.8} />
      </View>
      <OrdiloSheetHeader
        subtitle="Ordilo sagt Bescheid, wenn ein Dokument fertig gelesen ist oder eine Frist nah ist. Nachts von 20 bis 8 Uhr bleibt es still."
        title="Ordilo meldet sich gern"
      />
      <View style={styles.actions}>
        <OrdiloButton
          disabled={busy}
          onPress={onAllow}
          size="lg"
          title={busy ? "Einen Moment …" : "Mitteilungen erlauben"}
        />
        <OrdiloButton
          disabled={busy}
          onPress={onLater}
          title="Später"
          variant="ghost"
        />
      </View>
    </OrdiloSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  iconWrap: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  actions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
