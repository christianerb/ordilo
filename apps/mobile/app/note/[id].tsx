import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AnimatedSheetModal } from "@/src/components/sheet";
import { SwipeImagePreview } from "@/src/components/swipe-image-preview";
import { Card, EmptyState, OrdiloButton, Screen } from "@/src/components/ui";
import {
  buildNoteUpdatePayload,
  getNoteContent,
  updateDocumentSecret,
  updateConfirmedNote,
} from "@/src/lib/notes";
import {
  deleteDocument,
  documentTypeLabels,
  isImageFile,
  loadDocumentReview,
  loadOriginalFile,
  revealDocumentSecret,
  type DocumentReview,
  type DocumentType,
  type ReviewAnalysis,
} from "@/src/lib/document-review";
import {
  refreshLibraryDocuments,
  removeLibraryDocumentOptimistically,
} from "@/src/lib/library";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const noteTypes = Object.entries(documentTypeLabels) as [DocumentType, string][];

/**
 * A note has its own compact reader: its text stays readable first, while
 * metadata editing is kept behind a deliberate action. The existing PATCH
 * contract cannot rewrite OCR text, attachments, or encrypted secrets, so
 * this screen never pretends that it can.
 */
export default function NoteScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<DocumentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError("Die Notiz fehlt.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadDocumentReview(id);
      setNote(result);
      if (!result) setError("Die Notiz wurde nicht gefunden oder kann gerade nicht geladen werden.");
    } catch {
      setNote(null);
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const deleteNote = useCallback(async () => {
    if (!id || deleting) return;
    setDeleting(true);
    removeLibraryDocumentOptimistically(id);
    try {
      await deleteDocument(id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      refreshLibraryDocuments();
      setDeleting(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Notiz nicht gelöscht", "Bitte prüfe deine Verbindung und versuch es nochmal.");
    }
  }, [deleting, id, router]);

  const askToDelete = useCallback(() => {
    if (!note || deleting) return;
    Alert.alert(
      "Notiz löschen?",
      `"${note.title?.trim() || "Diese Notiz"}" wird aus eurer Ablage gelöscht. Das kannst du nicht rückgängig machen.`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Löschen", style: "destructive", onPress: () => void deleteNote() },
      ],
    );
  }, [deleteNote, deleting, note]);

  const openOriginal = useCallback(async () => {
    if (!id || openingOriginal) return;
    setOpeningOriginal(true);
    try {
      const file = await loadOriginalFile(id);
      if (isImageFile(file.mimeType)) {
        setImageUrl(file.url);
      } else if (await Linking.canOpenURL(file.url)) {
        await Linking.openURL(file.url);
      } else {
        throw new Error("No viewer.");
      }
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Bild nicht verfügbar", "Das Bild konnte nicht geöffnet werden. Bitte versuch es später nochmal.");
    } finally {
      setOpeningOriginal(false);
    }
  }, [id, openingOriginal]);

  if (loading) {
    return <Screen style={styles.center}><ActivityIndicator accessibilityLabel="Notiz wird geladen" color={colors.harborBlue} /></Screen>;
  }

  if (!note || !("summary" in note)) {
    return (
      <Screen>
        <NoteHeader onBack={() => router.back()} />
        <EmptyState
          icon={AlertCircle}
          heading="Notiz nicht verfügbar"
          description={error ?? "Diese Notiz kann gerade nicht geöffnet werden."}
        >
          <OrdiloButton onPress={() => void load()} size="lg" title="Erneut versuchen" />
        </EmptyState>
      </Screen>
    );
  }

  const hasAttachment = Boolean(note.mime_type || note.original_filename);
  const content = getNoteContent(note);
  const editable = note.status === "confirmed";

  return (
    <Screen style={styles.screen}>
      <NoteHeader
        onBack={() => router.back()}
        onEdit={editable ? () => setShowEditor(true) : undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.icon}><FileText color={colors.harborBlue} size={23} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.type}>{documentTypeLabels[note.document_type]}</Text>
            <Text style={styles.title}>{note.title || "Notiz"}</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Notiz</Text>
          <Text selectable style={styles.contentText}>{content}</Text>
        </Card>

        {note.summary ? (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Kurz gesagt</Text>
            <Text style={styles.summary}>{note.summary}</Text>
          </Card>
        ) : null}

        {note.document_type === "credentials" ? <SecretSection documentId={id} /> : null}

        {hasAttachment ? (
          <Pressable
            accessibilityHint="Öffnet das angehängte Bild"
            accessibilityLabel="Angehängtes Bild ansehen"
            accessibilityRole="button"
            disabled={openingOriginal}
            onPress={() => void openOriginal()}
            style={({ pressed }) => [styles.attachment, pressed && styles.pressed, openingOriginal && styles.disabled]}
          >
            {openingOriginal ? <ActivityIndicator color={colors.harborBlue} size="small" /> : <ImageIcon color={colors.harborBlue} size={19} />}
            <Text style={styles.attachmentText}>{openingOriginal ? "Bild wird geöffnet …" : "Angehängtes Bild ansehen"}</Text>
            <ChevronRight color={colors.mistDark} size={18} />
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          {editable ? (
            <OrdiloButton
              icon={<Pencil color={colors.graphite} size={17} />}
              onPress={() => setShowEditor(true)}
              title="Angaben bearbeiten"
              variant="outline"
            />
          ) : null}
          <Pressable
            accessibilityLabel="Notiz löschen"
            accessibilityRole="button"
            disabled={deleting}
            onPress={askToDelete}
            style={({ pressed }) => [styles.delete, pressed && styles.pressed, deleting && styles.disabled]}
          >
            {deleting ? <ActivityIndicator color={colors.destructive} size="small" /> : <Trash2 color={colors.destructive} size={18} />}
            <Text style={styles.deleteText}>{deleting ? "Wird gelöscht …" : "Notiz löschen"}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {showEditor ? (
        <NoteMetadataEditor
          documentId={id}
          note={note}
          onClose={() => setShowEditor(false)}
          onSaved={(changes) => {
            setNote((current) => current && "summary" in current
              ? { ...current, ...changes }
              : current);
            setShowEditor(false);
            refreshLibraryDocuments();
          }}
        />
      ) : null}
      <OriginalImagePreview imageUrl={imageUrl} onClose={() => setImageUrl(null)} />
    </Screen>
  );
}

function NoteHeader({ onBack, onEdit }: { onBack: () => void; onEdit?: () => void }) {
  return (
    <View style={styles.topbar}>
      <Pressable accessibilityLabel="Zurück" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.back}>
        <ArrowLeft color={colors.graphite} size={22} />
      </Pressable>
      <Text style={styles.topTitle}>Notiz</Text>
      {onEdit ? (
        <Pressable accessibilityLabel="Angaben bearbeiten" accessibilityRole="button" hitSlop={8} onPress={onEdit} style={styles.edit}>
          <Pencil color={colors.harborBlue} size={19} />
        </Pressable>
      ) : <View style={styles.edit} />}
    </View>
  );
}

function SecretSection({ documentId }: { documentId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const secretExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedSecret = useRef<string | null>(null);

  const clearSecret = useCallback(() => {
    setSecret(null);
    setVisible(false);
  }, []);

  const armSecretExpiry = useCallback(() => {
    if (secretExpiry.current) clearTimeout(secretExpiry.current);
    secretExpiry.current = setTimeout(clearSecret, 30_000);
  }, [clearSecret]);

  useEffect(() => () => {
    if (secretExpiry.current) clearTimeout(secretExpiry.current);
    if (clipboardExpiry.current) clearTimeout(clipboardExpiry.current);
    const copied = copiedSecret.current;
    if (copied) {
      void Clipboard.getStringAsync()
        .then((value) => value === copied ? Clipboard.setStringAsync("") : undefined)
        .catch(() => undefined);
    }
  }, []);

  const reveal = async () => {
    setLoading(true);
    try {
      const value = await revealDocumentSecret(documentId);
      if (!value) {
        Alert.alert("Kein Passwort gespeichert", "Für diese Zugangsdaten wurde kein Passwort hinterlegt.");
        return;
      }
      setSecret(value);
      setVisible(true);
      armSecretExpiry();
    } catch {
      Alert.alert("Passwort nicht verfügbar", "Bitte prüfe deine Verbindung und versuch es nochmal.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!secret) return;
    await Clipboard.setStringAsync(secret);
    copiedSecret.current = secret;
    armSecretExpiry();
    if (clipboardExpiry.current) clearTimeout(clipboardExpiry.current);
    clipboardExpiry.current = setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((value) => value === secret ? Clipboard.setStringAsync("") : undefined)
        .catch(() => undefined)
        .finally(() => {
          copiedSecret.current = null;
        });
    }, 30_000);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.secretHeader}>
        <KeyRound color={colors.mistDark} size={18} />
        <Text style={styles.sectionTitle}>Passwort</Text>
      </View>
      {visible && secret ? (
        <>
          <Text selectable style={styles.secretValue}>{secret}</Text>
          <View style={styles.secretActions}>
            <OrdiloButton
              icon={<Copy color={colors.graphite} size={16} />}
              onPress={() => void copy()}
              title="Kopieren"
              variant="outline"
            />
            <OrdiloButton
              icon={<EyeOff color={colors.mistDark} size={16} />}
              onPress={clearSecret}
              title="Verbergen"
              variant="ghost"
            />
          </View>
        </>
      ) : (
        <OrdiloButton
          icon={loading ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Eye color={colors.warmWhite} size={17} />}
          onPress={() => void reveal()}
          title={loading ? "Wird geladen …" : "Passwort anzeigen"}
        />
      )}
      <OrdiloButton
        icon={<Pencil color={colors.graphite} size={16} />}
        onPress={() => setEditing(true)}
        title="Passwort ändern"
        variant="outline"
      />
      {editing ? (
        <SecretEditor
          documentId={documentId}
          onClose={() => setEditing(false)}
          onSaved={() => {
            clearSecret();
            setEditing(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function SecretEditor({
  documentId,
  onClose,
  onSaved,
}: {
  documentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateDocumentSecret(documentId, secret);
      setSecret("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Das Passwort konnte nicht gespeichert werden. Bitte versuch es nochmal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedSheetModal dismissDisabled={saving} onClose={onClose} sheetStyle={styles.editorSheet} visible>
          <View style={styles.handle} />
          <Text style={styles.editorTitle}>Passwort ändern</Text>
          <Text style={styles.editorHint}>Leer lassen, um das gespeicherte Passwort zu entfernen.</Text>
          <View style={styles.secretEditorField}>
            <TextInput
              accessibilityLabel="Neues Passwort"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10_000}
              onChangeText={setSecret}
              placeholder="Passwort, PIN oder Code"
              placeholderTextColor={colors.mistDark}
              secureTextEntry={!showSecret}
              style={styles.secretEditorInput}
              value={secret}
            />
            <Pressable
              accessibilityLabel={showSecret ? "Passwort verbergen" : "Passwort anzeigen"}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowSecret((current) => !current)}
            >
              {showSecret
                ? <EyeOff color={colors.mistDark} size={19} />
                : <Eye color={colors.mistDark} size={19} />}
            </Pressable>
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={styles.editorFooter}>
            <OrdiloButton disabled={saving} onPress={onClose} title="Abbrechen" variant="outline" />
            <OrdiloButton
              disabled={saving}
              icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
              onPress={() => void save()}
              title={saving ? "Wird gespeichert …" : "Speichern"}
            />
          </View>
    </AnimatedSheetModal>
  );
}

function NoteMetadataEditor({
  documentId,
  note,
  onClose,
  onSaved,
}: {
  documentId: string;
  note: ReviewAnalysis;
  onClose: () => void;
  onSaved: (changes: Pick<ReviewAnalysis, "title" | "summary" | "document_type">) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [summary, setSummary] = useState(note.summary);
  const [documentType, setDocumentType] = useState(note.document_type);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    setSaving(true);
    setError(null);
    const changes = { title, summary, document_type: documentType };
    try {
      await updateConfirmedNote(documentId, buildNoteUpdatePayload(note, changes));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved({ title: title.trim(), summary: summary.trim(), document_type: documentType });
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Die Angaben konnten nicht gespeichert werden. Bitte versuch es nochmal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedSheetModal dismissDisabled={saving} onClose={onClose} sheetStyle={styles.editorSheet} visible>
          <View style={styles.handle} />
          <Text style={styles.editorTitle}>Angaben bearbeiten</Text>
          <Text style={styles.editorHint}>Text, Bild und Passwort bleiben geschützt und werden hier nicht geändert.</Text>
          <ScrollView contentContainerStyle={styles.editorForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Titel</Text>
            <TextInput accessibilityLabel="Titel der Notiz" maxLength={200} onChangeText={setTitle} style={styles.input} value={title} />
            <Text style={styles.label}>Art</Text>
            <ScrollView contentContainerStyle={styles.typeChips} horizontal showsHorizontalScrollIndicator={false}>
              {noteTypes.map(([type, label]) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: documentType === type }}
                  key={type}
                  onPress={() => setDocumentType(type)}
                  style={({ pressed }) => [styles.typeChip, documentType === type && styles.typeChipSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.typeChipText, documentType === type && styles.typeChipTextSelected]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>Kurz gesagt</Text>
            <TextInput accessibilityLabel="Kurz gesagt" maxLength={10_000} multiline onChangeText={setSummary} style={[styles.input, styles.summaryInput]} textAlignVertical="top" value={summary} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.editorFooter}>
            <OrdiloButton disabled={saving} onPress={onClose} title="Abbrechen" variant="outline" />
            <OrdiloButton disabled={saving} icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Check color={colors.warmWhite} size={17} />} onPress={() => void save()} title={saving ? "Wird gespeichert …" : "Speichern"} />
          </View>
    </AnimatedSheetModal>
  );
}

function OriginalImagePreview({ imageUrl, onClose }: { imageUrl: string | null; onClose: () => void }) {
  return imageUrl ? (
    <SwipeImagePreview
      imageAccessibilityLabel="Angehängtes Bild"
      imageUrl={imageUrl}
      onClose={onClose}
      title="Bild"
    />
  ) : null;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  center: { alignItems: "center", justifyContent: "center" },
  topbar: { alignItems: "center", flexDirection: "row", height: 60, justifyContent: "space-between", paddingHorizontal: spacing.md },
  back: { alignItems: "center", height: 44, justifyContent: "center", marginLeft: -6, width: 44 },
  topTitle: { color: colors.graphite, ...typography.title },
  edit: { alignItems: "center", height: 44, justifyContent: "center", marginRight: -6, width: 44 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing["2xl"] },
  hero: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  icon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 44, justifyContent: "center", width: 44 },
  heroCopy: { flex: 1 },
  type: { color: colors.mistDark, ...typography.label },
  title: { color: colors.graphite, ...typography.display },
  card: { gap: spacing.sm },
  sectionTitle: { color: colors.graphite, ...typography.title },
  contentText: { color: colors.graphite, ...typography.body },
  summary: { color: colors.mistDark, ...typography.body },
  attachment: { alignItems: "center", backgroundColor: colors.sand, borderColor: colors.mistLight, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: 12 },
  attachmentText: { color: colors.harborBlue, flex: 1, ...typography.title },
  actions: { alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  delete: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.sm },
  deleteText: { color: colors.destructive, ...typography.title },
  secretHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  secretValue: { backgroundColor: colors.sandLight, borderRadius: radii.base, color: colors.graphite, padding: 12, ...typography.body },
  secretActions: { flexDirection: "row", gap: spacing.sm },
  secretEditorField: { alignItems: "center", borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, flexDirection: "row", gap: spacing.sm, margin: spacing.md, minHeight: 44, paddingHorizontal: 12 },
  secretEditorInput: { color: colors.graphite, flex: 1, minHeight: 44, ...typography.body },
  editorSheet: { backgroundColor: colors.warmWhite, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: "85%", paddingBottom: spacing.md },
  handle: { alignSelf: "center", backgroundColor: colors.mistLight, borderRadius: radii.pill, height: 4, marginBottom: spacing.md, marginTop: spacing.sm, width: 40 },
  editorTitle: { color: colors.graphite, paddingHorizontal: spacing.md, ...typography.display },
  editorHint: { color: colors.mistDark, paddingHorizontal: spacing.md, paddingTop: spacing.xs, ...typography.timestamp },
  editorForm: { gap: spacing.sm, padding: spacing.md },
  label: { color: colors.graphite, ...typography.label },
  input: { borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, minHeight: 44, paddingHorizontal: 12, ...typography.body },
  summaryInput: { minHeight: 112, paddingTop: 10 },
  typeChips: { gap: spacing.xs },
  typeChip: { alignItems: "center", borderColor: colors.mistLight, borderRadius: radii.pill, borderWidth: 1, height: 36, justifyContent: "center", paddingHorizontal: 12 },
  typeChipSelected: { backgroundColor: colors.harborBlue, borderColor: colors.harborBlue },
  typeChipText: { color: colors.mistDark, ...typography.label },
  typeChipTextSelected: { color: colors.warmWhite },
  error: { color: colors.destructive, ...typography.timestamp },
  editorFooter: { borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", paddingHorizontal: spacing.md, paddingTop: spacing.md },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
});
