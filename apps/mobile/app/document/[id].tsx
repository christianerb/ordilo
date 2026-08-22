import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  ListChecks,
  Lock,
  Plus,
  Tag,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  deleteDocument,
  documentTypeLabels,
  isImageFile,
  loadDocumentReview,
  loadOriginalFile,
  parseCredentialFields,
  revealDocumentSecret,
  type DocumentReview,
  type ReviewAnalysis,
} from "@/src/lib/document-review";
import {
  refreshLibraryDocuments,
  removeLibraryDocumentOptimistically,
} from "@/src/lib/library";
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
  const [deleting, setDeleting] = useState(false);

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

  const requestDelete = () => {
    if (!document || !id || deleting) return;
    Alert.alert(
      "Dokument löschen?",
      `"${document.title?.trim() || "Dieses Dokument"}" wird aus eurer Ablage gelöscht. Das kannst du nicht rückgängig machen.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: () => void removeDocument(),
        },
      ],
    );
  };

  const removeDocument = async () => {
    if (!id) return;
    setDeleting(true);
    removeLibraryDocumentOptimistically(id);
    try {
      await deleteDocument(id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Dokument nicht gelöscht",
        "Bitte prüfe deine Verbindung und versuch es nochmal.",
      );
      refreshLibraryDocuments();
      setDeleting(false);
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

        <DocumentMetadata document={document} />

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

        <PeopleSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <DatesSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <TasksSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <AmountsSection analysis={document} editable={editable} onChange={updateAnalysis} />
        <FactsSection analysis={document} editable={editable} onChange={updateAnalysis} />

        {isReadOnly && document.organizations.length > 0 ? (
          <Section icon={FileText} title="Organisationen">
            {document.organizations.map((organization, index) => (
              <ReadValue key={`${organization.name}-${index}`} value={[organization.name, organization.type].filter(Boolean).join(" · ")} />
            ))}
          </Section>
        ) : null}

        {isReadOnly && document.document_type === "credentials" ? (
          <CredentialsSection
            documentId={id}
            credentialText={document.credential_text}
          />
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
          <Pressable
            accessibilityLabel="Dokument löschen"
            accessibilityRole="button"
            disabled={deleting}
            onPress={requestDelete}
            style={({ pressed }) => [
              styles.deleteDocument,
              pressed && styles.pressed,
              deleting && styles.disabled,
            ]}
          >
            {deleting ? <ActivityIndicator color={colors.destructive} size="small" /> : <Trash2 color={colors.destructive} size={18} />}
            <Text style={styles.deleteDocumentText}>
              {deleting ? "Dokument wird gelöscht …" : "Dokument löschen"}
            </Text>
          </Pressable>
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

function DocumentMetadata({ document }: { document: DocumentReview }) {
  const rows = [
    { label: "Datei", value: document.original_filename },
    { label: "Format", value: document.mime_type?.replace(/^application\//, "").toUpperCase() ?? null },
    { label: "Seiten", value: document.page_count ? `${document.page_count}` : null },
    { label: "Hinzugefügt", value: formatDetailDate(document.created_at) },
    ...(document.confirmed_at ? [{ label: "Gespeichert", value: formatDetailDate(document.confirmed_at) }] : []),
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  return (
    <Card style={styles.metadataCard}>
      <Text style={styles.sectionHeading}>Details</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.metadataRow}>
          <Text style={styles.metadataLabel}>{row.label}</Text>
          <Text numberOfLines={2} style={styles.metadataValue}>{row.value}</Text>
        </View>
      ))}
    </Card>
  );
}

function CredentialsSection({
  credentialText,
  documentId,
}: {
  credentialText: string | null;
  documentId: string;
}) {
  const fields = useMemo(() => parseCredentialFields(credentialText), [credentialText]);

  return (
    <Card style={styles.card}>
      <View style={styles.sectionTitle}>
        <KeyRound color={colors.mistDark} size={18} />
        <Text style={styles.sectionHeading}>Zugangsdaten</Text>
      </View>
      {fields.url ? <CredentialValue label="URL" value={fields.url} /> : null}
      {fields.username ? <CredentialValue label="Benutzername" value={fields.username} /> : null}
      <SecretReveal documentId={documentId} />
    </Card>
  );
}

function CredentialValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copy = async () => {
    const success = await Clipboard.setStringAsync(value);
    if (!success) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <View style={styles.credentialRow}>
      <View style={styles.credentialValue}>
        <Text style={styles.metadataLabel}>{label}</Text>
        <Text selectable style={styles.value}>{value}</Text>
      </View>
      <Pressable accessibilityLabel={`${label} kopieren`} accessibilityRole="button" onPress={() => void copy()} style={styles.iconButton}>
        {copied ? <Check color={colors.harborBlue} size={18} /> : <Copy color={colors.harborBlue} size={18} />}
      </Pressable>
    </View>
  );
}

function SecretReveal({ documentId }: { documentId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSecret = useCallback(() => {
    setSecret(null);
    setShow(false);
    setCopied(false);
  }, []);

  const armSecretExpiry = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(clearSecret, 30_000);
  }, [clearSecret]);

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    if (clipboardClearTimer.current) clearTimeout(clipboardClearTimer.current);
  }, []);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      setSecret(await revealDocumentSecret(documentId));
      setShow(true);
      armSecretExpiry();
    } catch {
      setError("Passwort konnte nicht geladen werden. Bitte versuch es nochmal.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (secret === null) return;
    const success = await Clipboard.setStringAsync(secret);
    if (!success) return;
    setCopied(true);
    armSecretExpiry();
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
    if (clipboardClearTimer.current) clearTimeout(clipboardClearTimer.current);
    clipboardClearTimer.current = setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((clipboard) => clipboard === secret ? Clipboard.setStringAsync("") : undefined)
        .catch(() => undefined);
    }, 30_000);
  };

  return (
    <View style={styles.secretBox}>
      <View style={styles.secretHeader}>
        <View style={styles.sectionTitle}>
          <Lock color={colors.mistDark} size={17} />
          <Text style={styles.metadataLabel}>Passwort</Text>
        </View>
        <View style={styles.secretActions}>
          {secret !== null ? (
            <>
              <Pressable accessibilityLabel={show ? "Passwort verbergen" : "Passwort anzeigen"} accessibilityRole="button" onPress={() => { setShow((current) => !current); armSecretExpiry(); }} style={styles.iconButton}>
                {show ? <EyeOff color={colors.mistDark} size={18} /> : <Eye color={colors.mistDark} size={18} />}
              </Pressable>
              <Pressable accessibilityLabel="Passwort kopieren" accessibilityRole="button" onPress={() => void copy()} style={styles.iconButton}>
                {copied ? <Check color={colors.harborBlue} size={18} /> : <Copy color={colors.harborBlue} size={18} />}
              </Pressable>
            </>
          ) : null}
          <Pressable accessibilityRole="button" disabled={loading} onPress={() => void reveal()} style={({ pressed }) => [styles.revealButton, pressed && styles.pressed, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color={colors.harborBlue} size="small" /> : <Text style={styles.revealText}>{secret === null ? "Anzeigen" : "Neu laden"}</Text>}
          </Pressable>
        </View>
      </View>
      {secret !== null && show ? <Text selectable style={styles.secretValue}>{secret}</Text> : null}
      <Text style={styles.secretHint}>Wird nach 30 Sekunden wieder verborgen.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.secretError}>{error}</Text> : null}
    </View>
  );
}

function formatDetailDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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
  return (
    <Section icon={UserRound} title="Personen" onAdd={editable ? () => onChange((current) => ({ ...current, family_members: [...current.family_members, { name: "", person_id: null, confidence: 1 }] })) : undefined}>
      {analysis.family_members.length === 0 ? <EmptyRows text="Keine Person erkannt." /> : null}
      {analysis.family_members.map((person, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("family_members", index, onChange)}>
          <FieldLabel text="Name" />
          <TextInput accessibilityLabel={`Person ${index + 1}`} onChangeText={(name) => updateAt("family_members", index, { name }, onChange)} style={styles.input} value={person.name} />
          <Confidence confidence={person.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={person.name} />)}
    </Section>
  );
}

function DatesSection({ analysis, editable, onChange }: SectionProps) {
  return (
    <Section icon={CalendarDays} title="Termine" onAdd={editable ? () => onChange((current) => ({ ...current, dates: [...current.dates, { date: "", label: "", type: "other", confidence: 1 }] })) : undefined}>
      {analysis.dates.length === 0 ? <EmptyRows text="Kein Termin erkannt." /> : null}
      {analysis.dates.map((date, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("dates", index, onChange)}>
          <FieldLabel text="Worum geht's?" />
          <TextInput accessibilityLabel={`Bezeichnung Termin ${index + 1}`} onChangeText={(label) => updateAt("dates", index, { label }, onChange)} placeholder="Zum Beispiel: Elternabend" placeholderTextColor={colors.mistDark} style={styles.input} value={date.label} />
          <FieldLabel text="Datum" />
          <TextInput accessibilityHint="Format Jahr Monat Tag, zum Beispiel 2025-08-10" accessibilityLabel={`Datum Termin ${index + 1}`} autoCapitalize="none" onChangeText={(dateValue) => updateAt("dates", index, { date: dateValue }, onChange)} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.mistDark} style={styles.input} value={date.date} />
          <Confidence confidence={date.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={[date.label, date.date].filter(Boolean).join(" · ")} />)}
    </Section>
  );
}

function TasksSection({ analysis, editable, onChange }: SectionProps) {
  return (
    <Section icon={ListChecks} title="Aufgaben" onAdd={editable ? () => onChange((current) => ({ ...current, tasks: [...current.tasks, { title: "", due_date: null, confidence: 1 }] })) : undefined}>
      {analysis.tasks.length === 0 ? <EmptyRows text="Keine Aufgabe erkannt." /> : null}
      {analysis.tasks.map((task, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("tasks", index, onChange)}>
          <FieldLabel text="Aufgabe" />
          <TextInput accessibilityLabel={`Aufgabe ${index + 1}`} onChangeText={(title) => updateAt("tasks", index, { title }, onChange)} style={styles.input} value={task.title} />
          <FieldLabel text="Fällig am" />
          <TextInput accessibilityHint="Leer lassen, wenn es kein Datum gibt" accessibilityLabel={`Fälligkeitsdatum Aufgabe ${index + 1}`} autoCapitalize="none" onChangeText={(dueDate) => updateAt("tasks", index, { due_date: dueDate || null }, onChange)} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.mistDark} style={styles.input} value={task.due_date ?? ""} />
          <Confidence confidence={task.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={task.due_date ? `${task.title} · ${task.due_date}` : task.title} />)}
    </Section>
  );
}

function AmountsSection({ analysis, editable, onChange }: SectionProps) {
  return (
    <Section icon={WalletCards} title="Beträge" onAdd={editable ? () => onChange((current) => ({ ...current, amounts: [...current.amounts, { amount: "", currency: "EUR", label: "", kind: "other", value_date: null, confidence: 1 }] })) : undefined}>
      {analysis.amounts.length === 0 ? <EmptyRows text="Kein Betrag erkannt." /> : null}
      {analysis.amounts.map((amount, index) => editable ? (
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
    </Section>
  );
}

function FactsSection({ analysis, editable, onChange }: SectionProps) {
  return (
    <Section icon={FileText} title="Nummern & Kennungen" onAdd={editable ? () => onChange((current) => ({ ...current, facts: [...current.facts, { fact_type: "identifier", label: "", value: "", confidence: 1 }] })) : undefined}>
      {analysis.facts.length === 0 ? <EmptyRows text="Keine Nummer erkannt." /> : null}
      {analysis.facts.map((fact, index) => editable ? (
        <EditableRow key={index} onDelete={() => removeAt("facts", index, onChange)}>
          <FieldLabel text="Bezeichnung" />
          <TextInput accessibilityLabel={`Bezeichnung Kennung ${index + 1}`} onChangeText={(label) => updateAt("facts", index, { label }, onChange)} placeholder="Zum Beispiel: Vertragsnummer" placeholderTextColor={colors.mistDark} style={styles.input} value={fact.label} />
          <FieldLabel text="Nummer" />
          <TextInput accessibilityLabel={`Kennung ${index + 1}`} onChangeText={(value) => updateAt("facts", index, { value }, onChange)} style={styles.input} value={fact.value} />
          <Confidence confidence={fact.confidence} />
        </EditableRow>
      ) : <ReadValue key={index} value={`${fact.label}: ${fact.value}`} />)}
    </Section>
  );
}

type SectionProps = {
  analysis: ReviewAnalysis;
  editable: boolean;
  onChange: (updater: (current: ReviewAnalysis) => ReviewAnalysis) => void;
};

function Section({ icon: IconComponent, title, onAdd, children }: { icon: Icon; title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitle}><IconComponent color={colors.mistDark} size={18} /><Text style={styles.sectionHeading}>{title}</Text></View>
        {onAdd ? <Pressable accessibilityLabel={`${title} hinzufügen`} accessibilityRole="button" onPress={onAdd} style={styles.addButton}><Plus color={colors.harborBlue} size={17} /><Text style={styles.addButtonText}>Hinzufügen</Text></Pressable> : null}
      </View>
      {children}
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
  metadataCard: { gap: 0 },
  metadataRow: { alignItems: "baseline", borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 38, paddingVertical: spacing.sm },
  metadataLabel: { color: colors.mistDark, minWidth: 92, ...typography.label },
  metadataValue: { color: colors.graphite, flex: 1, textAlign: "right", ...typography.timestamp },
  originalButton: { alignItems: "center", backgroundColor: colors.sandLight, borderColor: colors.mistLight, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm },
  originalText: { color: colors.harborBlue, flex: 1, ...typography.title },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.65 },
  notice: { alignItems: "center", backgroundColor: colors.sandWarm, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  noticeText: { color: colors.graphite, flex: 1, ...typography.timestamp },
  card: { gap: spacing.sm },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 28 },
  sectionTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionHeading: { color: colors.graphite, ...typography.title },
  label: { color: colors.mistDark, marginTop: spacing.xs, ...typography.label },
  input: { backgroundColor: colors.warmWhite, borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, minHeight: 40, paddingHorizontal: spacing.sm, ...typography.body },
  summary: { minHeight: 88, paddingTop: spacing.sm },
  value: { color: colors.graphite, ...typography.body },
  emptyRows: { color: colors.mistDark, ...typography.timestamp },
  confidence: { color: colors.warmApricot, ...typography.label },
  editableRow: { borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.xs, paddingTop: spacing.sm },
  rowContent: { flex: 1, gap: spacing.xs },
  deleteButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  addButton: { alignItems: "center", flexDirection: "row", gap: 2, minHeight: 44, paddingHorizontal: spacing.xs },
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
  deleteDocument: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm },
  deleteDocumentText: { color: colors.destructive, ...typography.title },
  credentialRow: { alignItems: "center", borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingVertical: spacing.sm },
  credentialValue: { flex: 1, gap: 2, minWidth: 0 },
  iconButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  secretBox: { backgroundColor: colors.sandLight, borderColor: colors.mistLight, borderRadius: radii.sm, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  secretHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  secretActions: { alignItems: "center", flexDirection: "row", gap: 2 },
  revealButton: { alignItems: "center", borderColor: colors.harborBlue, borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: 36, minWidth: 76, paddingHorizontal: spacing.sm },
  revealText: { color: colors.harborBlue, ...typography.label },
  secretValue: { backgroundColor: colors.warmWhite, borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, padding: spacing.sm, ...typography.body },
  secretHint: { color: colors.mistDark, ...typography.label },
  secretError: { color: colors.destructive, ...typography.label },
  preview: { backgroundColor: colors.warmWhite, flex: 1 },
  previewHeader: { alignItems: "center", borderBottomColor: colors.mistLight, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.md },
  previewTitle: { color: colors.graphite, ...typography.title },
  closeButton: { alignItems: "center", height: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  closeText: { color: colors.harborBlue, ...typography.title },
  previewImage: { flex: 1, height: undefined, width: "100%" },
});
