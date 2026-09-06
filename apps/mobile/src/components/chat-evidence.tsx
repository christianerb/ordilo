import { useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight, FileText, X } from "lucide-react-native";
import type { ChatSource } from "@ordilo/chat-contract";
import { loadOriginalFile, type OriginalFile } from "@/src/lib/document-review";
import { tap } from "@/src/lib/feedback";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function HighlightedQuote({ source }: { source: ChatSource }) {
  const quote = source.quote ?? source.excerpt;
  const position = source.highlight ? quote.toLocaleLowerCase("de-DE").indexOf(source.highlight.toLocaleLowerCase("de-DE")) : -1;
  return <Text selectable style={styles.quote}>
    {position < 0 ? quote : <>{quote.slice(0, position)}<Text style={styles.mark}>{quote.slice(position, position + source.highlight!.length)}</Text>{quote.slice(position + source.highlight!.length)}</>}
  </Text>;
}

/** The original passage stays in the conversation and expands in place into its own reading surface. */
export function ChatEvidence({ source, onOpenDocument }: { source: ChatSource; onOpenDocument: (id: string) => void }) {
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState<OriginalFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function openOriginal() {
    setLoading(true); setError(null);
    try {
      const file = await loadOriginalFile(source.document_id);
      if (file.mimeType?.startsWith("image/")) setOriginal(file);
      else await Linking.openURL(`${file.url}${source.page_number ? `#page=${source.page_number}` : ""}`);
    } catch { setError("Das Original konnte gerade nicht geöffnet werden. Versuche es noch einmal."); }
    finally { setLoading(false); }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Fundstelle öffnen: ${source.title ?? "Dokument"}${source.page_number ? `, Seite ${source.page_number}` : ""}`}
      onPress={() => { tap(); setOpen(true); }} style={({ pressed }) => [styles.paper, pressed && styles.pressed]}>
      <View style={styles.sourceHeader}><FileText size={17} color={colors.harborBlue} />
        <Text numberOfLines={2} style={styles.title}>{source.title ?? "Eure Unterlage"}</Text>
        <ArrowUpRight size={18} color={colors.harborBlue} />
      </View>
      <HighlightedQuote source={source} />
      <Text style={styles.caption}>{source.page_number ? `Seite ${source.page_number} · ` : ""}Fundstelle ansehen</Text>
    </Pressable>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
        <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, fontScale > 1.3 && styles.accessibleHeading]}>Die Fundstelle</Text>
          <Pressable accessibilityLabel="Fundstelle schließen" accessibilityRole="button" onPress={() => setOpen(false)} style={styles.close}><X size={22} color={colors.graphite} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.reading}>
          <Text style={[styles.documentTitle, fontScale > 1.3 && styles.accessibleHeading]}>{source.title ?? "Eure Unterlage"}</Text>
          <Text style={styles.caption}>{source.page_number ? `Originaltext · Seite ${source.page_number}` : "Originaltext"}</Text>
          <View style={styles.passage}><HighlightedQuote source={source} /></View>
          {original && <Image accessibilityLabel="Originalunterlage" source={{ uri: original.url }} resizeMode="contain" style={styles.original} />}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {source.has_original !== false && <Pressable accessibilityRole="button" disabled={loading} onPress={() => void openOriginal()} style={styles.originalButton}>
            {loading ? <ActivityIndicator color={colors.warmWhite} /> : <ArrowUpRight color={colors.warmWhite} size={19} />}
            <Text style={styles.originalLabel}>Original öffnen</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onOpenDocument(source.document_id); }} style={styles.documentButton}>
            <Text style={styles.documentLabel}>Zur Dokumentübersicht</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.sand, borderRadius: radii.sm, padding: 18, gap: 14, marginTop: 12 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  sourceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { ...typography.label, color: colors.harborBlue, flex: 1 },
  quote: { ...typography.body, color: colors.graphite, lineHeight: 25 },
  mark: { backgroundColor: colors.warmApricotLight, fontFamily: "Figtree_600SemiBold" },
  caption: { ...typography.label, color: colors.mistDark },
  sheet: { flex: 1, backgroundColor: colors.warmWhite },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 8 },
  sheetTitle: { ...typography.display, color: colors.graphite },
  accessibleHeading: { fontSize: 18, lineHeight: 24, flexShrink: 1 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  reading: { padding: 24, gap: 16 },
  documentTitle: { ...typography.display, fontSize: 26, lineHeight: 32, color: colors.graphite },
  passage: { backgroundColor: colors.sand, borderRadius: radii.sm, padding: 24, marginVertical: spacing.md },
  original: { width: "100%", height: 450 },
  originalButton: { flexDirection: "row", gap: 8, minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.harborBlue, borderRadius: radii.sm, padding: 12 },
  originalLabel: { flexShrink: 1, ...typography.body, color: colors.warmWhite },
  documentButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  documentLabel: { ...typography.body, color: colors.harborBlue },
  error: { ...typography.body, color: colors.destructive },
});
