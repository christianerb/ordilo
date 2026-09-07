import { useCallback, useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { FileDown } from "lucide-react-native";
import { Card, DetailTopBar, EmptyState, OrdiloButton, Screen, Skeleton } from "@/src/components/ui";
import { useSession } from "@/src/lib/session";
import { useFamily } from "@/src/lib/family-context";
import { listOfflineDocuments, readOfflineDocument, removeOfflineDocument, shareOfflineOriginal, type OfflineDocument, type OfflineDocumentSummary } from "@/src/lib/offline-documents";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function OfflineScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { family } = useFamily();
  const userId = session?.user.id;
  const familyId = family?.id;
  const [documents, setDocuments] = useState<OfflineDocumentSummary[]>([]);
  const [selected, setSelected] = useState<OfflineDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      setLoading(true); setSelected(null); setDocuments([]); setError(null);
      try {
        const saved = userId ? await listOfflineDocuments(userId, familyId) : [];
        if (active) setDocuments(saved);
      } catch {
        if (active) setError("Die Offline-Kopien konnten nicht gelesen werden. Entsperre dein Gerät und versuch es nochmal.");
      } finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
  }, [userId, familyId]));
  const remove = (document: OfflineDocument) => {
    Alert.alert("Offline-Kopie entfernen?", "Das Dokument bleibt in deiner Ablage.", [
      { text: "Behalten", style: "cancel" },
      { text: "Kopie entfernen", style: "destructive", onPress: () => { void (async () => {
        try {
          await removeOfflineDocument(document.userId, document.familyId, document.id);
          setDocuments((current) => current.filter((entry) => entry.id !== document.id || entry.familyId !== document.familyId));
          setSelected(null);
        } catch { Alert.alert("Nicht entfernt", "Bitte versuch es nochmal."); }
      })(); } },
    ]);
  };
  const share = async (document: OfflineDocument) => {
    setSharing(true);
    try { await shareOfflineOriginal(document); }
    catch { Alert.alert("Original nicht geöffnet", "Bitte versuch es nochmal."); }
    finally { setSharing(false); }
  };
  return <Screen>
    <DetailTopBar title={selected ? "Offline-Kopie" : "Ohne Internet"} onBack={() => selected ? setSelected(null) : router.back()} />
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <Text style={[typography.heading, { color: colors.graphite }]}>{selected?.title ?? "Deine wichtigen Unterlagen. Auch unterwegs."}</Text>
      <Text style={[typography.body, { color: colors.mistDark }]}>Nur die Kopien auf diesem Gerät. Änderungen in der Ablage werden hier erst nach erneutem Speichern sichtbar.</Text>
      {loading ? <Skeleton height={160} /> : error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.destructive }]}>{error}</Text> : selected ? <>
        <Text style={[typography.caption, { color: colors.mistDark }]}>Stand vom {new Date(selected.savedAt).toLocaleString("de-DE")}</Text>
        {selected.mimeType.startsWith("image/") ? <Image alt="Gespeichertes Original" accessibilityLabel="Gespeichertes Original" resizeMode="contain" style={{ width: "100%", height: 400 }} source={{ uri: `data:${selected.mimeType};base64,${selected.original}` }} /> : null}
        {selected.summary ? <Card><Text selectable style={[typography.body, { color: colors.graphite }]}>{selected.summary}</Text></Card> : null}
        {selected.ocrText ? <View style={{ gap: spacing.sm }}><Text style={[typography.heading, { color: colors.graphite }]}>Erkannter Text</Text><Text selectable style={[typography.body, { color: colors.graphite }]}>{selected.ocrText}</Text></View> : <Text style={[typography.body, { color: colors.mistDark }]}>Für dieses Dokument gibt es keinen erkannten Text. Das Original ist gespeichert.</Text>}
        <OrdiloButton title={sharing ? "Wird geöffnet …" : "Original öffnen oder teilen"} disabled={sharing} onPress={() => void share(selected)} />
        <Text style={[typography.caption, { color: colors.mistDark }]}>Wenn du eine andere App auswählst, kann sie eine eigene Kopie behalten.</Text>
        <OrdiloButton title="Offline-Kopie entfernen" variant="ghost" onPress={() => remove(selected)} />
      </> : documents.length ? documents.map((document) => <Card key={`${document.familyId}.${document.id}`}><View style={{ gap: spacing.sm }}>
        <Text style={[typography.body, { color: colors.graphite }]}>{document.title}</Text>
        <Text style={[typography.caption, { color: colors.mistDark }]}>Stand vom {new Date(document.savedAt).toLocaleString("de-DE")}</Text>
        <OrdiloButton title="Kopie ansehen" variant="outline" onPress={() => { if (!userId) return; void readOfflineDocument(userId, document.familyId, document.id).then(setSelected).catch(() => Alert.alert("Kopie nicht geöffnet", "Bitte versuch es nochmal.")); }} />
      </View></Card>) : <EmptyState icon={FileDown} heading="Noch keine Offline-Kopien" description="Öffne mit Internet ein Dokument und wähle „Auf diesem Gerät speichern“. Danach findest du es hier." />}
    </ScrollView>
  </Screen>;
}
