import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MoreHorizontal,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { ConfirmDialog } from "@/src/components/confirm-dialog";
import {
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormInput,
  OrdiloFormSheet,
} from "@/src/components/sheet";
import { SwipeImagePreview } from "@/src/components/swipe-image-preview";
import { DetailTopBar, EmptyState, ListSkeleton, OrdiloButton, Screen, SpringPressable } from "@/src/components/ui";
import {
  buildDocumentUpdatePayload,
  getNoteContent,
  isShortNoteValue,
  shouldShowNoteSummary,
  updateDocumentSecret,
  updateConfirmedDocument,
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
import { stateEntering } from "@/src/theme/motion";
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
  const [showSecretEditor, setShowSecretEditor] = useState(false);
  const [secretVersion, setSecretVersion] = useState(0);
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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteNote = useCallback(async () => {
    if (!id || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    removeLibraryDocumentOptimistically(id);
    try {
      await deleteDocument(id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      refreshLibraryDocuments();
      setDeleting(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setDeleteError("Die Notiz konnte nicht gelöscht werden. Bitte prüfe deine Verbindung und versuch es nochmal.");
    }
  }, [deleting, id, router]);

  const askToDelete = useCallback(() => {
    if (!note || deleting) return;
    setDeleteError(null);
    setDeleteOpen(true);
  }, [deleting, note]);

  const openMenu = useCallback(() => {
    if (!note || deleting) return;
    const actions: { label: string; run: () => void }[] = [];
    if (note.status === "confirmed") actions.push({ label: "Bearbeiten", run: () => setShowEditor(true) });
    if (note.document_type === "credentials") actions.push({ label: "Passwort ändern", run: () => setShowSecretEditor(true) });
    const destructiveIndex = actions.length;
    actions.push({ label: "Löschen", run: askToDelete });
    if (Platform.OS === "ios") {
      const options = [...actions.map((action) => action.label), "Abbrechen"];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: options.length - 1 },
        (index) => actions[index]?.run(),
      );
      return;
    }
    Alert.alert(note.title?.trim() || "Notiz", undefined, [
      ...actions.map((action, index) => ({
        text: action.label,
        style: index === destructiveIndex ? "destructive" as const : "default" as const,
        onPress: action.run,
      })),
      { text: "Abbrechen", style: "cancel" as const },
    ]);
  }, [askToDelete, deleting, note]);

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
    return (
      <Screen style={styles.screen}>
        <DetailTopBar onBack={() => router.back()} title="Notiz" />
        <View style={styles.loadingContent}>
          <ListSkeleton rows={4} />
        </View>
      </Screen>
    );
  }

  if (!note || !("summary" in note)) {
    return (
      <Screen>
        <DetailTopBar onBack={() => router.back()} title="Notiz" />
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

  return (
    <Screen style={styles.screen}>
      <DetailTopBar
        onBack={() => router.back()}
        title={note.document_type === "note" ? undefined : documentTypeLabels[note.document_type]}
        trailing={
          <Pressable
            accessibilityLabel="Weitere Aktionen"
            accessibilityRole="button"
            disabled={deleting}
            hitSlop={8}
            onPress={openMenu}
            style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
          >
            {deleting
              ? <ActivityIndicator color={colors.mistDark} size="small" />
              : <MoreHorizontal color={colors.graphite} size={22} />}
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.title}>{note.title || "Notiz"}</Text>

        <NoteContent content={content} hasText={Boolean(note.ocr_text?.trim())} />

        {shouldShowNoteSummary(content, note.summary) ? (
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryLabel}>Kurz gesagt</Text>
            <Text style={styles.summary}>{note.summary}</Text>
          </View>
        ) : null}

        {note.document_type === "credentials" ? <SecretSection documentId={id} key={secretVersion} /> : null}

        {hasAttachment ? (
          <Pressable
            accessibilityHint="Öffnet das angehängte Bild"
            accessibilityLabel="Bild ansehen"
            accessibilityRole="button"
            disabled={openingOriginal}
            onPress={() => void openOriginal()}
            style={({ pressed }) => [styles.attachment, pressed && styles.pressed, openingOriginal && styles.disabled]}
          >
            {openingOriginal ? <ActivityIndicator color={colors.harborBlue} size="small" /> : <ImageIcon color={colors.harborBlue} size={19} />}
            <Text style={styles.attachmentText}>{openingOriginal ? "Bild wird geöffnet …" : "Bild ansehen"}</Text>
            <ChevronRight color={colors.mistDark} size={18} />
          </Pressable>
        ) : null}
      </ScrollView>
      {showSecretEditor ? (
        <SecretEditor
          documentId={id}
          onClose={() => setShowSecretEditor(false)}
          onSaved={() => {
            setShowSecretEditor(false);
            // Remounting drops a revealed copy of the old password.
            setSecretVersion((current) => current + 1);
          }}
        />
      ) : null}
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
      <ConfirmDialog
        error={deleteError}
        loading={deleting}
        loadingLabel="Wird gelöscht …"
        message={`"${note.title?.trim() || "Diese Notiz"}" wird aus eurer Ablage gelöscht. Das kannst du nicht rückgängig machen.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteNote()}
        title="Notiz löschen?"
        visible={deleteOpen}
      />
      <OriginalImagePreview imageUrl={imageUrl} onClose={() => setImageUrl(null)} />
    </Screen>
  );
}

const copiedResetMs = 1600;

/**
 * The note's text is the reason the screen was opened, so it leads. A short
 * value is shown large and copies with one tap anywhere on it; longer text
 * stays selectable reading text with the same copy action beneath.
 */
function NoteContent({ content, hasText }: { content: string; hasText: boolean }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isValue = hasText && isShortNoteValue(content);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(content.trim());
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), copiedResetMs);
  }, [content]);

  if (!hasText) {
    return <Text style={styles.emptyText}>{content}</Text>;
  }

  const copyLabel = (
    <View style={styles.copyRow}>
      <Animated.View entering={stateEntering()} key={copied ? "copied" : "copy"} style={styles.copyInner}>
        {copied
          ? <Check color={colors.harborBlue} size={16} strokeWidth={2.4} />
          : <Copy color={colors.harborBlue} size={16} />}
        <Text style={styles.copyText}>{copied ? "Kopiert" : "Kopieren"}</Text>
      </Animated.View>
    </View>
  );

  if (isValue) {
    return (
      <SpringPressable
        accessibilityHint="Kopiert den Wert"
        accessibilityLabel={`${content}. ${copied ? "Kopiert" : "Kopieren"}`}
        haptic={false}
        onPress={() => void copy()}
        style={styles.valuePanel}
      >
        <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={2} style={styles.value}>
          {content}
        </Text>
        {copyLabel}
      </SpringPressable>
    );
  }

  return (
    <View style={styles.textPanel}>
      <Text selectable style={styles.contentText}>{content}</Text>
      <Pressable
        accessibilityLabel={copied ? "Kopiert" : "Text kopieren"}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => void copy()}
        style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
      >
        {copyLabel}
      </Pressable>
    </View>
  );
}

function SecretSection({ documentId }: { documentId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedReset = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (copiedReset.current) clearTimeout(copiedReset.current);
    const pending = copiedSecret.current;
    if (pending) {
      void Clipboard.getStringAsync()
        .then((value) => value === pending ? Clipboard.setStringAsync("") : undefined)
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    if (copiedReset.current) clearTimeout(copiedReset.current);
    copiedReset.current = setTimeout(() => setCopied(false), copiedResetMs);
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

  const shown = visible && secret;

  return (
    <View style={styles.secretPanel}>
      <View style={styles.secretCopy}>
        <Text style={styles.summaryLabel}>Passwort</Text>
        <Text numberOfLines={2} selectable={Boolean(shown)} style={shown ? styles.secretValue : styles.secretMasked}>
          {shown ? secret : "••••••••"}
        </Text>
      </View>
      {shown ? (
        <Pressable
          accessibilityLabel={copied ? "Kopiert" : "Passwort kopieren"}
          accessibilityRole="button"
          onPress={() => void copy()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Animated.View entering={stateEntering()} key={copied ? "copied" : "copy"}>
            {copied
              ? <Check color={colors.harborBlue} size={19} strokeWidth={2.4} />
              : <Copy color={colors.harborBlue} size={19} />}
          </Animated.View>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={shown ? "Passwort verbergen" : "Passwort anzeigen"}
        accessibilityRole="button"
        disabled={loading}
        onPress={shown ? clearSecret : () => void reveal()}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        {loading
          ? <ActivityIndicator color={colors.harborBlue} size="small" />
          : shown
            ? <EyeOff color={colors.mistDark} size={19} />
            : <Eye color={colors.harborBlue} size={19} />}
      </Pressable>
    </View>
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
    <OrdiloFormSheet
      dismissDisabled={saving}
      keyboardAvoiding
      onClose={onClose}
      subtitle="Leer lassen, um das gespeicherte Passwort zu entfernen."
      title="Passwort ändern"
      visible
    >
      <OrdiloFormBody>
        <OrdiloFormField label="Passwort">
          <OrdiloFormInput
            accessibilityLabel="Neues Passwort"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10_000}
            onChangeText={setSecret}
            placeholder="Passwort, PIN oder Code"
            secureTextEntry={!showSecret}
            trailing={<Pressable
              accessibilityLabel={showSecret ? "Passwort verbergen" : "Passwort anzeigen"}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowSecret((current) => !current)}
            >
              {showSecret
                ? <EyeOff color={colors.mistDark} size={19} />
                : <Eye color={colors.mistDark} size={19} />}
            </Pressable>}
            value={secret}
          />
        </OrdiloFormField>
      </OrdiloFormBody>
      <OrdiloFormFooter
        error={error}
        primary={<OrdiloButton
          disabled={saving}
          icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
          onPress={() => void save()}
          size="lg"
          title={saving ? "Wird gespeichert …" : "Speichern"}
        />}
        secondary={<OrdiloButton disabled={saving} onPress={onClose} size="lg" title="Abbrechen" variant="outline" />}
      />
    </OrdiloFormSheet>
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
      await updateConfirmedDocument(
        documentId,
        buildDocumentUpdatePayload(note, changes),
      );
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
    <OrdiloFormSheet
      dismissDisabled={saving}
      keyboardAvoiding
      onClose={onClose}
      subtitle="Den Text der Notiz kannst du hier nicht ändern."
      title="Bearbeiten"
      visible
    >
      <OrdiloFormBody>
        <OrdiloFormField label="Titel">
          <OrdiloFormInput accessibilityLabel="Titel der Notiz" maxLength={200} onChangeText={setTitle} value={title} />
        </OrdiloFormField>
        <OrdiloFormField label="Art">
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
        </OrdiloFormField>
        <OrdiloFormField label="Kurz gesagt">
          <OrdiloFormInput accessibilityLabel="Kurz gesagt" maxLength={10_000} multiline onChangeText={setSummary} value={summary} />
        </OrdiloFormField>
      </OrdiloFormBody>
      <OrdiloFormFooter
        error={error}
        primary={<OrdiloButton disabled={saving} icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Check color={colors.warmWhite} size={17} />} onPress={() => void save()} size="lg" title={saving ? "Wird gespeichert …" : "Speichern"} />}
        secondary={<OrdiloButton disabled={saving} onPress={onClose} size="lg" title="Abbrechen" variant="outline" />}
      />
    </OrdiloFormSheet>
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
  loadingContent: { paddingHorizontal: spacing.md },
  edit: { alignItems: "center", height: 44, justifyContent: "center", marginRight: -6, width: 44 },
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing["2xl"] },
  title: { color: colors.graphite, ...typography.largeTitle },
  valuePanel: { backgroundColor: colors.sand, borderRadius: radii.md, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  value: { color: colors.harborBlue, fontFamily: typography.largeTitle.fontFamily, fontSize: 40, fontVariant: ["tabular-nums"], letterSpacing: 0.5, lineHeight: 46 },
  textPanel: { backgroundColor: colors.sand, borderRadius: radii.sm, gap: spacing.md, padding: spacing.md },
  contentText: { color: colors.graphite, ...typography.body },
  emptyText: { color: colors.mistDark, ...typography.body },
  copyRow: { flexDirection: "row", minHeight: 20 },
  copyInner: { alignItems: "center", flexDirection: "row", gap: 6 },
  copyButton: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  copyText: { color: colors.harborBlue, ...typography.caption },
  summaryBlock: { gap: spacing.xs },
  summaryLabel: { color: colors.mistDark, ...typography.label },
  summary: { color: colors.graphite, ...typography.body },
  attachment: { alignItems: "center", backgroundColor: colors.sand, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  attachmentText: { color: colors.harborBlue, flex: 1, ...typography.title },
  secretPanel: { alignItems: "center", backgroundColor: colors.sand, borderRadius: radii.sm, flexDirection: "row", gap: spacing.xs, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.sm },
  secretCopy: { flex: 1, gap: spacing.xs },
  secretValue: { color: colors.graphite, ...typography.title },
  secretMasked: { color: colors.mistDark, letterSpacing: 2, ...typography.title },
  iconButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  typeChips: { gap: spacing.xs },
  typeChip: { alignItems: "center", borderColor: colors.mistLight, borderRadius: radii.pill, borderWidth: 1, height: 36, justifyContent: "center", paddingHorizontal: 12 },
  typeChipSelected: { backgroundColor: colors.harborBlue, borderColor: colors.harborBlue },
  typeChipText: { color: colors.mistDark, ...typography.label },
  typeChipTextSelected: { color: colors.warmWhite },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
});
