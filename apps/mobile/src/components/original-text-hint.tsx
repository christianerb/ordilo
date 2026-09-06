import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { findOriginalTextMatch } from "@/src/lib/original-text-hint";
import { colors, radii, sizes, spacing, typography } from "@/src/theme/tokens";

/** A local comparison aid. OCR is explicitly separate from the original file. */
export function OriginalTextHint({ text, value }: { text: string | null | undefined; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const match = useMemo(() => findOriginalTextMatch(text, value), [text, value]);
  const Icon = expanded ? ChevronUp : ChevronDown;
  return <View style={styles.container}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Erkannten Text ${expanded ? "ausblenden" : "anzeigen"}`}
      accessibilityHint="Vergleicht diese Angabe mit dem automatisch gelesenen Text"
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((current) => !current)}
      style={styles.toggle}
    >
      <Text style={styles.label}>Erkannter Text</Text>
      <Icon size={18} color={colors.harborBlue} accessibilityElementsHidden />
    </Pressable>
    {expanded ? <View style={styles.body}>
      {match.kind === "match" ? <Text selectable style={styles.excerpt}>
        {match.clippedBefore ? "… " : ""}{match.excerpt}{match.clippedAfter ? " …" : ""}
      </Text> : <Text style={styles.excerpt}>
        {match.kind === "ambiguous"
          ? "Diese Angabe kommt mehrmals vor. Wir können keine eindeutige Textstelle zeigen."
          : "Zu dieser Angabe haben wir keine passende Textstelle gefunden."}
      </Text>}
      <Text style={styles.note}>Der Text wurde automatisch gelesen und kann Fehler enthalten. Über „Mit Original vergleichen“ öffnest du die gespeicherte Datei.</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  toggle: { minHeight: sizes.touch, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  label: { color: colors.harborBlue, ...typography.caption, flexShrink: 1 },
  body: { padding: spacing.sm, gap: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.sand },
  excerpt: { color: colors.graphite, ...typography.timestamp },
  note: { color: colors.mistDark, ...typography.timestamp },
});
