import { useCallback, useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, CircleCheck, FileDown } from "lucide-react-native";
import { Card, DetailTopBar, EmptyState, IconTile, ListGroup, ListRow, OrdiloButton, Screen, SectionHeader, Skeleton } from "@/src/components/ui";
import { useSession } from "@/src/lib/session";
import { useFamily } from "@/src/lib/family-context";
import { listOfflineDocuments, readOfflineDocument, refreshOfflineCopy, removeOfflineDocument, shareOfflineOriginal, type OfflineDocument, type OfflineDocumentSummary } from "@/src/lib/offline-documents";
import { readPlanSnapshot, type PlanSnapshot, type PlanSnapshotRow } from "@/src/lib/plan-offline";
import { colors, spacing, typography } from "@/src/theme/tokens";

function planWhen(row: PlanSnapshotRow): string | null {
  return [row.when, row.person].filter((part): part is string => Boolean(part)).join(" · ") || null;
}

export default function OfflineScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { family } = useFamily();
  const userId = session?.user.id;
  const familyId = family?.id;
  const [documents, setDocuments] = useState<OfflineDocumentSummary[]>([]);
  const [plan, setPlan] = useState<PlanSnapshot | null>(null);
  const [selected, setSelected] = useState<OfflineDocument | null>(null);
  const [missing, setMissing] = useState<OfflineDocumentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      setLoading(true); setSelected(null); setDocuments([]); setError(null); setMissing(null); setPlan(null);
      try {
        const saved = userId ? await listOfflineDocuments(userId, familyId) : [];
        const planSnapshot = familyId ? await readPlanSnapshot(familyId) : null;
        if (!active) return;
        setDocuments(saved);
        setPlan(planSnapshot);
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
    catch { Alert.alert("Kopie nicht geöffnet", "Bitte versuch es nochmal."); }
    finally { setSharing(false); }
  };
  const openCopy = async (summary: OfflineDocumentSummary) => {
    if (!userId) return;
    try {
      setSelected(await readOfflineDocument(userId, summary.familyId, summary.id));
    } catch {
      // The entry is listed but the sealed file or its key is gone — offer
      // the honest way back: load it again while online.
      setMissing(summary);
    }
  };
  const redownload = async (summary: OfflineDocumentSummary) => {
    if (!userId) return;
    setRetrying(true);
    // refreshOfflineCopy never throws; offline it is a no-op and the
    // re-read below still fails, which turns into the friendly message.
    await refreshOfflineCopy(summary.id);
    try {
      const fresh = await readOfflineDocument(userId, summary.familyId, summary.id);
      setSelected(fresh);
      setMissing(null);
    } catch {
      Alert.alert("Noch nicht geladen", "Dafür brauchst du kurz Internet. Versuch es nochmal, sobald du online bist.");
    } finally { setRetrying(false); }
  };
  const planTasks = plan?.rows.filter((row) => row.kind === "task") ?? [];
  const planEvents = plan?.rows.filter((row) => row.kind === "event") ?? [];
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
        <OrdiloButton title={sharing ? "Wird geöffnet …" : "Offline-Kopie öffnen"} disabled={sharing} onPress={() => void share(selected)} />
        <Text style={[typography.caption, { color: colors.mistDark }]}>Wenn du eine andere App auswählst, kann sie eine eigene Kopie behalten.</Text>
        <OrdiloButton title="Offline-Kopie entfernen" variant="ghost" onPress={() => remove(selected)} />
      </> : <>
        {plan && plan.rows.length > 0 ? <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Plan" />
          <Text style={[typography.caption, { color: colors.mistDark }]}>Zuletzt geladen am {new Date(plan.savedAt).toLocaleDateString("de-DE")}. Ohne Internet nur zum Lesen — Änderungen kommen mit der nächsten Verbindung dazu.</Text>
          {planTasks.length ? <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: colors.mistDark }]}>Aufgaben</Text>
            <ListGroup>
              {planTasks.map((row, index) => <ListRow
                first={index === 0}
                key={row.id}
                leading={<IconTile><CircleCheck color={colors.harborBlue} size={19} strokeWidth={1.9} /></IconTile>}
                subtitle={planWhen(row) ?? undefined}
                title={row.title}
              />)}
            </ListGroup>
          </View> : null}
          {planEvents.length ? <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: colors.mistDark }]}>Termine</Text>
            <ListGroup>
              {planEvents.map((row, index) => <ListRow
                first={index === 0}
                key={row.id}
                leading={<IconTile><CalendarDays color={colors.harborBlue} size={19} strokeWidth={1.9} /></IconTile>}
                subtitle={planWhen(row) ?? undefined}
                title={row.title}
              />)}
            </ListGroup>
          </View> : null}
        </View> : null}
        {missing ? <Card><View style={{ gap: spacing.sm }}>
          <Text style={[typography.body, { color: colors.graphite }]}>„{missing.title}“ ist nicht mehr auf diesem Gerät.</Text>
          <OrdiloButton title={retrying ? "Wird geladen …" : "Mit Internet neu laden"} disabled={retrying} onPress={() => void redownload(missing)} />
          <OrdiloButton title="Später" variant="ghost" onPress={() => setMissing(null)} />
        </View></Card> : null}
        {documents.length ? documents.map((document) => <Card key={`${document.familyId}.${document.id}`}><View style={{ gap: spacing.sm }}>
          <Text style={[typography.body, { color: colors.graphite }]}>{document.title}</Text>
          <Text style={[typography.caption, { color: colors.mistDark }]}>Stand vom {new Date(document.savedAt).toLocaleString("de-DE")}</Text>
          <OrdiloButton title="Kopie ansehen" variant="outline" onPress={() => void openCopy(document)} />
        </View></Card>) : <EmptyState icon={FileDown} heading="Noch keine Offline-Kopien" description="Öffne mit Internet ein Dokument und wähle „Auf diesem Gerät speichern“. Danach findest du es hier." />}
      </>}
    </ScrollView>
  </Screen>;
}
