import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Tag,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Card, EmptyState, OrdiloButton, Screen } from "@/src/components/ui";
import {
  canReviewDocument,
  confirmDocumentReview,
  documentTypeLabels,
  isImageFile,
  loadDocumentReview,
  loadOriginalFile,
  type DocumentReview,
  type ReviewAnalysis,
} from "@/src/lib/document-review";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Icon = typeof Tag;

export default function DocumentReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [document, setDocument] = useState<DocumentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError("Das Dokument fehlt.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const value = await loadDocumentReview(id);
      setDocument(value);
      if (!value) setError("Das Dokument wurde nicht gefunden oder kann gerade nicht geladen werden.");
    } catch {
      setDocument(null);
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      void Promise.resolve().then(() => {
        setError("Das Dokument fehlt.");
        setLoading(false);
      });
      return;
    }
    void loadDocumentReview(id)
      .then((value) => {
        setDocument(value);
        if (!value) setError("Das Dokument wurde nicht gefunden oder kann gerade nicht geladen werden.");
      })
      .catch(() => {
        setDocument(null);
        setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const updateAnalysis = (updater: (current: ReviewAnalysis) => ReviewAnalysis) => {
    setDocument((current) => current && "summary" in current ? updater(current) : current);
  };

  const confirm = async () => {
    if (!document || !("summary" in document) || !canReviewDocument(document.status) || !id) return;
    if (!document.title.trim()) {
      Alert.alert("Titel fehlt", "Gib dem Dokument einen kurzen Namen, damit ihr es später wiederfindet.");
      return;
    }
    setSaving(true);
    try {
      await confirmDocumentReview(id, document);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Nicht gespeichert", "Bitte prüfe deine Verbindung und versuch es nochmal.");
    } finally {
      setSaving(false);
    }
  };

  const viewOriginal = async () => {
    if (!id || openingOriginal) return;
    setOpeningOriginal(true);
    try {
      const file = await loadOriginalFile(id);
      if (isImageFile(file.mimeType)) {
        setImageUrl(file.url);
        return;
      }
      const supported = await Linking.canOpenURL(file.url);
      if (!supported) throw new Error("No viewer available.");
      await Linking.openURL(file.url);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Original nicht verfügbar",
        "Die Datei konnte nicht geöffnet werden. Bitte versuch es später nochmal.",
      );
    } finally {
      setOpeningOriginal(false);
    }
  };

  if (loading) {
    return <Screen style={styles.center}><ActivityIndicator accessibilityLabel="Dokument wird geladen" color={colors.harborBlue} /></Screen>;
  }

  if (!document) {
    return (
      <Screen>
        <EmptyState
          icon={AlertCircle}
          heading="Dokument nicht verfügbar"
          description={error ?? "Dieses Dokument kann gerade nicht geöffnet werden."}
        >
          <OrdiloButton title="Erneut versuchen" size="lg" onPress={() => void load()} />
        </EmptyState>
      </Screen>
    );
  }

  if (!("summary" in document)) {
    return <UnavailableState document={document} onBack={() => router.replace("/(tabs)")} />;
  }

  const isReadOnly = document.status === "confirmed";
  const editable = canReviewDocument(document.status);

  return (
    <Screen style={styles.screen}>
      <ReviewHeader
        title={isReadOnly ? "Dokument" : "Dokument prüfen"}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <View style={styles.fileIcon}><FileText color={colors.harborBlue} size={24} /></View>
          <View style={styles.introCopy}>
            <Text style={styles.type}>{documentTypeLabels[document.document_type]}</Text>
            <Text style={styles.help}>
              {isReadOnly
                ? "Dieses Dokument ist sicher in eurem Familienbuch."
                : "Ordilo hat das gefunden. Du kannst alles kurz prüfen."}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityHint="Öffnet das gespeicherte Original."
          accessibilityLabel="Original ansehen"
          accessibilityRole="button"
          disabled={openingOriginal}
          onPress={() => void viewOriginal()}
          style={({ pressed }) => [styles.originalButton, pressed && styles.pressed, openingOriginal && styles.disabled]}
        >
          {openingOriginal ? <ActivityIndicator color={colors.harborBlue} size="small" /> : <ImageIcon color={colors.harborBlue} size={19} />}
          <Text style={styles.originalText}>{openingOriginal ? "Original wird geöffnet …" : "Original ansehen"}</Text>
          <ChevronRight color={colors.mistDark} size={18} />
        </Pressable>

        {!isReadOnly && document.needs_user_review ? (
          <View accessibilityRole="alert" style={styles.notice}>
            <CircleAlert color={colors.warmApricot} size={18} />
            <Text style={styles.noticeText}>Ein paar Angaben sind unsicher. Schau bitte kurz drauf.</Text>
          </View>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.sectionHeading}>Das Wichtigste</Text>
          <FieldLabel text="Name" />
          {editable ? (
            <TextInput
              accessibilityLabel="Name des Dokuments"
              maxLength={200}
              onChangeText={(title) => updateAnalysis((current) => ({ ...current, title }))}
              style={styles.input}
              value={document.title}
            />
          ) : <ReadValue value={document.title} />}
          <FieldLabel text="Worum geht's?" />
          {editable ? (
            <TextInput
              accessibilityLabel="Zusammenfassung"
              multiline
              onChangeText={(summary) => updateAnalysis((current) => ({ ...current, summary }))}
              style={[styles.input, styles.summary]}
              textAlignVertical="top"
              value={document.summary}
            />
          ) : <ReadValue value={document.summary || "Keine Zusammenfassung."} />}
        </Card>

        <Section icon={Tag} title="Ablage">
          {editable ? (
            <>
              <FieldLabel text="Kategorie" />
              <TextInput
                accessibilityLabel="Kategorie"
                onChangeText={(suggested_category) => updateAnalysis((current) => ({ ...current, suggested_category }))}
                style={styles.input}
                value={document.suggested_category}
              />
              <FieldLabel text="Schlagwörter" />
              <View style={styles.tags}>
                {document.tags.map((tag, index) => (
                  <Pressable
                    accessibilityHint="Entfernt dieses Schlagwort"
                    accessibilityLabel={`${tag} entfernen`}
                    accessibilityRole="button"
                    key={`${tag}-${index}`}
                    onPress={() => updateAnalysis((current) => ({ ...current, tags: current.tags.filter((_, tagIndex) => tagIndex !== index) }))}
                    style={styles.tag}
                  >
                    <Text style={styles.tagText}>{tag} ×</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.addLine}>
                <TextInput
                  accessibilityLabel="Neues Schlagwort"
                  onChangeText={setTagDraft}
                  onSubmitEditing={() => addTag(document, tagDraft, setTagDraft, updateAnalysis)}
                  placeholder="Schlagwort"
                  placeholderTextColor={colors.mistDark}
                  returnKeyType="done"
                  style={[styles.input, styles.addInput]}
                  value={tagDraft}
                />
                <SmallButton label="Hinzufügen" onPress={() => addTag(document, tagDraft, setTagDraft, updateAnalysis)} />
              </View>
            </>
          ) : (
            <View style={styles.tags}>
              <ReadValue value={document.suggested_category} />
              {document.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}
            </View>
          )}
        </Section>

        <TasksSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <PeopleSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <DatesSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <AmountsSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <FactsSection analysis={document} editable={editable} onChange={updateAnalysis} />

        {isReadOnly && document.organizations.length > 0 ? (
          <Section icon={FileText} title="Organisationen">
            {document.organizations.map((organization, index) => (
              <ReadValue key={`${organization.name}-${index}`} value={[organization.name, organization.type].filter(Boolean).join(" · ")} />
            ))}
          </Section>
        ) : null}

        <View style={styles.actions}>
          {isReadOnly ? (
            <OrdiloButton title="Zur Übersicht" size="lg" onPress={() => router.replace("/(tabs)")} />
          ) : (
            <>
              <OrdiloButton
                disabled={saving || !document.title.trim()}
                icon={saving ? <ActivityIndicator color={colors.warmWhite} /> : <Check color={colors.warmWhite} size={19} />}
                onPress={() => void confirm()}
                size="lg"
                title={saving ? "Wird gespeichert …" : "Passt so"}
              />
              <OrdiloButton title="Später prüfen" variant="ghost" onPress={() => router.replace("/(tabs)")} />
            </>
          )}
        </View>
      </ScrollView>

      <OriginalImagePreview imageUrl={imageUrl} onClose={() => setImageUrl(null)} />
    </Screen>
  );
}

function ReviewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.topbar}>
      <Pressable accessibilityLabel="Zurück" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.back}>
        <ArrowLeft color={colors.graphite} size={22} />
      </Pressable>
      <Text style={styles.topTitle}>{title}</Text>
    </View>
  );
}

function UnavailableState({ document, onBack }: { document: Exclude<DocumentReview, ReviewAnalysis>; onBack: () => void }) {
  const failed = document.status === "failed";
  const processing = ["uploaded", "ocr_processing", "ocr_done", "analyzing"].includes(document.status);
  return (
    <Screen>
      <ReviewHeader title="Dokument" onBack={onBack} />
      <EmptyState
        icon={failed ? AlertCircle : FileText}
        heading={failed ? "Das hat nicht geklappt" : processing ? "Dokument wird vorbereitet" : "Noch nicht bereit"}
        description={failed
          ? "Die Verarbeitung dieses Dokuments ist fehlgeschlagen. Du kannst es später noch einmal scannen."
          : "Ordilo bereitet das Dokument gerade vor. Schau in einem Moment noch einmal vorbei."}
      >
        <OrdiloButton title="Zur Übersicht" size="lg" onPress={onBack} />
      </EmptyState>
    </Screen>
  );
}

function OriginalImagePreview({ imageUrl, onClose }: { imageUrl: string | null; onClose: () => void }) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={Boolean(imageUrl)}>
      <SwipePreview imageUrl={imageUrl} onClose={onClose} />
    </Modal>
  );
}

function SwipePreview({ imageUrl, onClose }: { imageUrl: string | null; onClose: () => void }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const drag = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((event) => {
      const distance = Math.max(0, event.translationY);
      translateY.set(distance);
      opacity.set(Math.max(0.35, 1 - distance / 500));
    })
    .onEnd((event) => {
      if (event.translationY > 120 || event.velocityY > 900) {
        translateY.set(withSpring(700, { duration: 300, dampingRatio: 0.8, velocity: event.velocityY }));
        opacity.set(withSpring(0, { duration: 220, dampingRatio: 1 }));
        scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Light);
        scheduleOnRN(onClose);
      } else {
        translateY.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: event.velocityY }));
        opacity.set(withSpring(1, { duration: 220, dampingRatio: 1 }));
      }
    });
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }],
  }));

  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.preview, animatedStyle]}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>Original</Text>
          <Pressable accessibilityLabel="Original schließen" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Fertig</Text>
          </Pressable>
        </View>
        {imageUrl ? <Image accessibilityLabel="Originaldokument" resizeMode="contain" source={{ uri: imageUrl }} style={styles.previewImage} /> : null}
      </Animated.View>
    </GestureDetector>
  );
}

function PeopleSection({ analysis, editable, onChange }: SectionProps) {
  const people = analysis.family_members;
  return (
    <CollapsibleSection
      defaultExpanded={hasUncertainValue(people)}
      icon={UserRound}
      onAdd={editable ? () => onChange((current) => ({ ...current, family_members: [...current.family_members, { name: "", person_id: null, confidence: 1 }] })) : undefined}
      subtitle={entitySummary(people.length, "Person", "Personen", people.map((person) => person.name))}
      title="Personen"
    >
      {people.length === 0 ? <EmptyRows text="Keine Person erkannt." /> : null}
      {people.map((person, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("family_members", index, onChange)}>
          <FieldLabel text="Name" />
          <TextInput accessibilityLabel={`Person ${index + 1}`} onChangeText={(name) => updateAt("family_members", index, { name }, onChange)} style={styles.input} value={person.name} />
          <Confidence confidence={person.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={person.name} />)}
    </CollapsibleSection>
  );
}

function DatesSection({ analysis, editable, onChange }: SectionProps) {
  const dates = analysis.dates;
  return (
    <CollapsibleSection
      defaultExpanded={hasUncertainValue(dates)}
      icon={CalendarDays}
      onAdd={editable ? () => onChange((current) => ({ ...current, dates: [...current.dates, { date: "", label: "", type: "other", confidence: 1 }] })) : undefined}
      subtitle={entitySummary(dates.length, "Termin", "Termine", dates.map((date) => date.label || date.date))}
      title="Termine"
    >
      {dates.length === 0 ? <EmptyRows text="Kein Termin erkannt." /> : null}
      {dates.map((date, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("dates", index, onChange)}>
          <FieldLabel text="Worum geht's?" />
          <TextInput accessibilityLabel={`Bezeichnung Termin ${index + 1}`} onChangeText={(label) => updateAt("dates", index, { label }, onChange)} placeholder="Zum Beispiel: Elternabend" placeholderTextColor={colors.mistDark} style={styles.input} value={date.label} />
          <FieldLabel text="Datum" />
          <TextInput accessibilityHint="Format Jahr Monat Tag, zum Beispiel 2025-08-10" accessibilityLabel={`Datum Termin ${index + 1}`} autoCapitalize="none" onChangeText={(dateValue) => updateAt("dates", index, { date: dateValue }, onChange)} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.mistDark} style={styles.input} value={date.date} />
          <Confidence confidence={date.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={[date.label, date.date].filter(Boolean).join(" · ")} />)}
    </CollapsibleSection>
  );
}

function TasksSection({ analysis, editable, onChange }: SectionProps) {
  const tasks = analysis.tasks;
  return (
    <CollapsibleSection
      defaultExpanded={tasks.length > 0}
      icon={ListChecks}
      onAdd={editable ? () => onChange((current) => ({ ...current, tasks: [...current.tasks, { title: "", due_date: null, confidence: 1 }] })) : undefined}
      subtitle={entitySummary(tasks.length, "Aufgabe", "Aufgaben", tasks.map((task) => task.title))}
      title="Aufgaben"
    >
      {tasks.length === 0 ? <EmptyRows text="Keine Aufgabe erkannt." /> : null}
      {tasks.map((task, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("tasks", index, onChange)}>
          <FieldLabel text="Aufgabe" />
          <TextInput accessibilityLabel={`Aufgabe ${index + 1}`} onChangeText={(title) => updateAt("tasks", index, { title }, onChange)} style={styles.input} value={task.title} />
          <FieldLabel text="Fällig am" />
          <TextInput accessibilityHint="Leer lassen, wenn es kein Datum gibt" accessibilityLabel={`Fälligkeitsdatum Aufgabe ${index + 1}`} autoCapitalize="none" onChangeText={(dueDate) => updateAt("tasks", index, { due_date: dueDate || null }, onChange)} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.mistDark} style={styles.input} value={task.due_date ?? ""} />
          <Confidence confidence={task.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={task.due_date ? `${task.title} · ${task.due_date}` : task.title} />)}
    </CollapsibleSection>
  );
}

function AmountsSection({ analysis, editable, onChange }: SectionProps) {
  const amounts = analysis.amounts;
  return (
    <CollapsibleSection
      defaultExpanded={hasUncertainValue(amounts)}
      icon={WalletCards}
      onAdd={editable ? () => onChange((current) => ({ ...current, amounts: [...current.amounts, { amount: "", currency: "EUR", label: "", kind: "other", value_date: null, confidence: 1 }] })) : undefined}
      subtitle={entitySummary(amounts.length, "Betrag", "Beträge", amounts.map((amount) => amount.label || amount.amount))}
      title="Beträge"
    >
      {amounts.length === 0 ? <EmptyRows text="Kein Betrag erkannt." /> : null}
      {amounts.map((amount, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("amounts", index, onChange)}>
          <FieldLabel text="Bezeichnung" />
          <TextInput accessibilityLabel={`Bezeichnung Betrag ${index + 1}`} onChangeText={(label) => updateAt("amounts", index, { label }, onChange)} placeholder="Zum Beispiel: Gesamtbetrag" placeholderTextColor={colors.mistDark} style={styles.input} value={amount.label} />
          <View style={styles.twoColumns}>
            <View style={styles.half}><FieldLabel text="Betrag" /><TextInput accessibilityLabel={`Betrag ${index + 1}`} keyboardType="decimal-pad" onChangeText={(amountValue) => updateAt("amounts", index, { amount: amountValue }, onChange)} style={styles.input} value={amount.amount} /></View>
            <View style={styles.half}><FieldLabel text="Währung" /><TextInput accessibilityLabel={`Währung Betrag ${index + 1}`} autoCapitalize="characters" maxLength={3} onChangeText={(currency) => updateAt("amounts", index, { currency }, onChange)} style={styles.input} value={amount.currency} /></View>
          </View>
          <Confidence confidence={amount.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={[amount.label || "Betrag", amount.amount, amount.currency].filter(Boolean).join(" · ")} />)}
    </CollapsibleSection>
  );
}

function FactsSection({ analysis, editable, onChange }: SectionProps) {
  const facts = analysis.facts;
  return (
    <CollapsibleSection
      defaultExpanded={hasUncertainValue(facts)}
      icon={FileText}
      onAdd={editable ? () => onChange((current) => ({ ...current, facts: [...current.facts, { fact_type: "identifier", label: "", value: "", confidence: 1 }] })) : undefined}
      subtitle={entitySummary(facts.length, "Kennung", "Kennungen", facts.map((fact) => fact.label || fact.value))}
      title="Nummern & Kennungen"
    >
      {facts.length === 0 ? <EmptyRows text="Keine Nummer erkannt." /> : null}
      {facts.map((fact, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("facts", index, onChange)}>
          <FieldLabel text="Bezeichnung" />
          <TextInput accessibilityLabel={`Bezeichnung Kennung ${index + 1}`} onChangeText={(label) => updateAt("facts", index, { label }, onChange)} placeholder="Zum Beispiel: Vertragsnummer" placeholderTextColor={colors.mistDark} style={styles.input} value={fact.label} />
          <FieldLabel text="Nummer" />
          <TextInput accessibilityLabel={`Kennung ${index + 1}`} onChangeText={(value) => updateAt("facts", index, { value }, onChange)} style={styles.input} value={fact.value} />
          <Confidence confidence={fact.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={`${fact.label}: ${fact.value}`} />)}
    </CollapsibleSection>
  );
}

type SectionProps = {
  analysis: ReviewAnalysis;
  editable: boolean;
  onChange: (updater: (current: ReviewAnalysis) => ReviewAnalysis) => void;
};

function Section({ icon: IconComponent, title, children }: { icon: Icon; title: string; children: React.ReactNode }) {
  return (
    <Card style={styles.card}>
      <View style={styles.staticSectionHeader}>
        <IconComponent color={colors.mistDark} size={18} />
        <Text style={styles.sectionHeading}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

function CollapsibleSection({
  defaultExpanded,
  icon: IconComponent,
  title,
  subtitle,
  onAdd,
  children,
}: {
  defaultExpanded: boolean;
  icon: Icon;
  title: string;
  subtitle: string;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => {
    void Haptics.selectionAsync();
    setExpanded((current) => !current);
  };

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityHint={expanded ? "Klappt die Angaben zu." : "Zeigt die Angaben zum Prüfen und Ändern."}
        accessibilityLabel={`${title}, ${subtitle}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.pressed]}
      >
        <View style={styles.sectionTitle}>
          <IconComponent color={colors.mistDark} size={18} />
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionHeading}>{title}</Text>
            <Text numberOfLines={1} style={styles.sectionSubtitle}>{subtitle}</Text>
          </View>
        </View>
        <ChevronDown color={colors.harborBlue} size={20} style={expanded ? styles.chevronUp : undefined} />
      </Pressable>
      {expanded ? (
        <>
          {children}
          {onAdd ? <Pressable accessibilityLabel={`${title} hinzufügen`} accessibilityRole="button" onPress={onAdd} style={styles.addButton}><Plus color={colors.harborBlue} size={17} /><Text style={styles.addButtonText}>Hinzufügen</Text></Pressable> : null}
        </>
      ) : null}
    </Card>
  );
}

function EditableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <View style={styles.editableRow}>
      <View style={styles.rowContent}>{children}</View>
      <Pressable accessibilityLabel="Eintrag entfernen" accessibilityRole="button" hitSlop={6} onPress={onDelete} style={styles.deleteButton}>
        <Trash2 color={colors.destructive} size={18} />
      </Pressable>
    </View>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.smallButton}><Text style={styles.smallButtonText}>{label}</Text></Pressable>;
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function ReadValue({ value }: { value: string }) {
  return <Text style={styles.value}>{value}</Text>;
}

function EmptyRows({ text }: { text: string }) {
  return <Text style={styles.emptyRows}>{text}</Text>;
}

function Confidence({ confidence }: { confidence: number }) {
  return confidence < 0.7 ? <Text style={styles.confidence}>Bitte prüfen</Text> : null;
}

function hasUncertainValue(values: { confidence: number }[]) {
  return values.some((value) => value.confidence < 0.7);
}

function entitySummary(count: number, singular: string, plural: string, values: string[]) {
  if (count === 0) return `Keine ${plural.toLocaleLowerCase("de")} erkannt`;
  const firstValue = values.find((value) => value.trim());
  return `${count} ${count === 1 ? singular : plural}${firstValue ? ` · ${firstValue}` : ""}`;
}

function updateAt<Key extends "family_members" | "dates" | "tasks" | "amounts" | "facts">(
  key: Key,
  index: number,
  patch: Partial<ReviewAnalysis[Key][number]>,
  onChange: SectionProps["onChange"],
) {
  onChange((current) => ({
    ...current,
    [key]: current[key].map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }) as ReviewAnalysis);
}

function removeAt<Key extends "family_members" | "dates" | "tasks" | "amounts" | "facts">(
  key: Key,
  index: number,
  onChange: SectionProps["onChange"],
) {
  void Haptics.selectionAsync();
  onChange((current) => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }) as ReviewAnalysis);
}

function addTag(
  document: ReviewAnalysis,
  tagDraft: string,
  setTagDraft: (value: string) => void,
  onChange: SectionProps["onChange"],
) {
  const tag = tagDraft.trim();
  if (!tag || document.tags.some((existing) => existing.toLocaleLowerCase("de") === tag.toLocaleLowerCase("de"))) return;
  void Haptics.selectionAsync();
  onChange((current) => ({ ...current, tags: [...current.tags, tag] }));
  setTagDraft("");
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  center: { alignItems: "center", justifyContent: "center" },
  topbar: { alignItems: "center", borderBottomColor: colors.mistLight, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  topTitle: { color: colors.graphite, ...typography.title },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing["2xl"] },
  intro: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  introCopy: { flex: 1 },
  fileIcon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 48, justifyContent: "center", width: 48 },
  type: { color: colors.graphite, ...typography.title },
  help: { color: colors.mistDark, ...typography.timestamp, marginTop: 2 },
  originalButton: { alignItems: "center", backgroundColor: colors.sandLight, borderColor: colors.mistLight, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm },
  originalText: { color: colors.harborBlue, flex: 1, ...typography.title },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.65 },
  notice: { alignItems: "center", backgroundColor: colors.sandWarm, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  noticeText: { color: colors.graphite, flex: 1, ...typography.timestamp },
  card: { gap: spacing.sm },
  staticSectionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 28 },
  collapsibleHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 48 },
  sectionTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionCopy: { flex: 1, gap: 2 },
  sectionHeading: { color: colors.graphite, ...typography.title },
  sectionSubtitle: { color: colors.mistDark, ...typography.timestamp },
  chevronUp: { transform: [{ rotate: "180deg" }] },
  label: { color: colors.mistDark, marginTop: spacing.xs, ...typography.label },
  input: { backgroundColor: colors.warmWhite, borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, minHeight: 40, paddingHorizontal: spacing.sm, ...typography.body },
  summary: { minHeight: 88, paddingTop: spacing.sm },
  value: { color: colors.graphite, ...typography.body },
  emptyRows: { color: colors.mistDark, ...typography.timestamp },
  confidence: { color: colors.warmApricot, ...typography.label },
  editableRow: { borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.xs, paddingTop: spacing.sm },
  rowContent: { flex: 1, gap: spacing.xs },
  deleteButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  addButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 2, minHeight: 44, paddingHorizontal: spacing.xs },
  addButtonText: { color: colors.harborBlue, ...typography.label },
  addLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  addInput: { flex: 1 },
  smallButton: { alignItems: "center", backgroundColor: colors.harborBlue, borderRadius: radii.sm, height: 40, justifyContent: "center", paddingHorizontal: spacing.sm },
  smallButtonText: { color: colors.warmWhite, ...typography.label },
  tags: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tag: { alignItems: "center", backgroundColor: colors.blueSoft, borderColor: colors.harborBlue, borderRadius: radii.pill, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: colors.harborBlue, ...typography.label },
  twoColumns: { flexDirection: "row", gap: spacing.sm },
  half: { flex: 1, gap: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  preview: { backgroundColor: colors.warmWhite, flex: 1 },
  previewHeader: { alignItems: "center", borderBottomColor: colors.mistLight, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.md },
  previewTitle: { color: colors.graphite, ...typography.title },
  closeButton: { alignItems: "center", height: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  closeText: { color: colors.harborBlue, ...typography.title },
  previewImage: { flex: 1, height: undefined, width: "100%" },
});
