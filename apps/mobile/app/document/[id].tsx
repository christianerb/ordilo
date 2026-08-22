import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { AlertCircle, ArrowLeft, CalendarDays, Check, FileText, ListChecks, Tag, UserRound } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Card, OrdiloButton, Screen } from "@/src/components/ui";
import { confirmDocumentReview, documentTypeLabels, loadDocumentReview, type ReviewAnalysis } from "@/src/lib/document-review";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function DocumentReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const value = await loadDocumentReview(id);
    setAnalysis(value);
    if (!value) setError("Das Dokument konnte nicht geladen werden.");
    setLoading(false);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    void loadDocumentReview(id)
      .then((value) => {
        setAnalysis(value);
        if (!value) setError("Dieses Dokument kann gerade nicht geprüft werden.");
      })
      .catch(() => setError("Das Dokument konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [id]);

  const confirm = async () => {
    if (!analysis || analysis.status !== "analyzed" || !id) return;
    setSaving(true);
    try {
      await confirmDocumentReview(id, analysis);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Nicht gespeichert", "Bitte prüfe deine Verbindung und versuch es nochmal.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen style={styles.center}><ActivityIndicator color={colors.harborBlue} /></Screen>;
  if (!analysis) return <Screen style={styles.center}><AlertCircle color={colors.destructive} size={32} /><Text style={styles.error}>{error}</Text><OrdiloButton title="Erneut versuchen" onPress={() => void load()} /></Screen>;

  const isReadOnly = analysis.status === "confirmed";
  return (
    <Screen style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityLabel="Zurück" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.graphite} size={22} /></Pressable>
        <Text style={styles.topTitle}>Dokument prüfen</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}><View style={styles.fileIcon}><FileText color={colors.harborBlue} size={24} /></View><View><Text style={styles.type}>{documentTypeLabels[analysis.document_type]}</Text><Text style={styles.help}>{isReadOnly ? "Dieses Dokument ist sicher in eurem Familienbuch." : "Ordilo hat das gefunden. Du kannst es noch ändern."}</Text></View></View>
        {analysis.needs_user_review ? <View style={styles.notice}><AlertCircle color={colors.warmApricot} size={18}/><Text style={styles.noticeText}>Ein paar Angaben sind unsicher. Schau bitte kurz drauf.</Text></View> : null}
        <Card style={styles.card}><Label text="Name" /><TextInput editable={!isReadOnly} value={analysis.title} onChangeText={(title) => setAnalysis({ ...analysis, title })} style={[styles.input, isReadOnly && styles.readOnly]} /><Label text="Worum geht's?" /><TextInput editable={!isReadOnly} multiline value={analysis.summary} onChangeText={(summary) => setAnalysis({ ...analysis, summary })} style={[styles.input, styles.summary, isReadOnly && styles.readOnly]} /></Card>
        <Facts icon={Tag} title="Ablage" values={[analysis.suggested_category, ...analysis.tags]} />
        <Facts icon={UserRound} title="Personen" values={analysis.family_members.map((member) => member.name)} />
        <Facts icon={CalendarDays} title="Termine" values={analysis.dates.map((date) => `${date.label || date.type}: ${date.date}`)} />
        <Facts icon={ListChecks} title="Aufgaben" values={analysis.tasks.map((task) => task.due_date ? `${task.title} · ${task.due_date}` : task.title)} />
        {analysis.amounts.length ? <Facts icon={FileText} title="Beträge" values={analysis.amounts.map((amount) => `${amount.label || "Betrag"}: ${amount.amount} ${amount.currency}`)} /> : null}
        <View style={styles.actions}>{isReadOnly ? <OrdiloButton title="Zur Übersicht" size="lg" onPress={() => router.replace("/(tabs)")} /> : <><OrdiloButton disabled={saving || !analysis.title.trim()} size="lg" title={saving ? "Wird gespeichert …" : "Passt so"} icon={saving ? <ActivityIndicator color={colors.warmWhite} /> : <Check color={colors.warmWhite} size={19} />} onPress={() => void confirm()} /><OrdiloButton title="Später prüfen" variant="ghost" onPress={() => router.replace("/(tabs)")} /></>}</View>
      </ScrollView>
    </Screen>
  );
}

function Label({ text }: { text: string }) { return <Text style={styles.label}>{text}</Text>; }
function Facts({ icon: Icon, title, values }: { icon: typeof Tag; title: string; values: string[] }) {
  if (!values.length) return null;
  return <Card style={styles.card}><View style={styles.sectionTitle}><Icon color={colors.mistDark} size={18} /><Text style={styles.sectionText}>{title}</Text></View>{values.map((value, index) => <Text key={`${value}-${index}`} style={styles.value}>{value}</Text>)}</Card>;
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, center: { alignItems: "center", gap: spacing.md, justifyContent: "center" }, error: { color: colors.mistDark, ...typography.body, textAlign: "center" },
  topbar: { alignItems: "center", borderBottomColor: colors.mistLight, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, height: 54, paddingHorizontal: spacing.md }, back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 }, topTitle: { color: colors.graphite, ...typography.title },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing["2xl"] }, intro: { alignItems: "center", flexDirection: "row", gap: spacing.sm }, fileIcon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 48, justifyContent: "center", width: 48 }, type: { color: colors.graphite, ...typography.title }, help: { color: colors.mistDark, ...typography.timestamp, maxWidth: 270 },
  notice: { alignItems: "center", backgroundColor: colors.sandWarm, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.sm }, noticeText: { color: colors.graphite, flex: 1, ...typography.timestamp },
  card: { gap: spacing.sm }, label: { color: colors.mistDark, ...typography.label }, input: { borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, minHeight: 40, paddingHorizontal: spacing.sm, ...typography.body }, readOnly: { backgroundColor: colors.sandLight }, summary: { minHeight: 88, paddingTop: spacing.sm, textAlignVertical: "top" },
  sectionTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm }, sectionText: { color: colors.graphite, ...typography.title }, value: { color: colors.mistDark, ...typography.body }, actions: { gap: spacing.sm, marginTop: spacing.sm },
});
