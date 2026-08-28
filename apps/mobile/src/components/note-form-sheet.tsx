import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  KeyRound,
  X,
} from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { OrdiloPickerSheet } from "@/src/components/picker-sheet";
import { OrdiloFormSheet } from "@/src/components/sheet";
import { OrdiloButton } from "@/src/components/ui";
import {
  buildCredentialsContent,
  maxNoteContentLength,
  type NoteAttachment,
} from "@/src/lib/notes";
import {
  documentTypeLabels,
  type DocumentType,
} from "@/src/lib/document-review";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const noteTypes = Object.entries(documentTypeLabels) as [DocumentType, string][];

export type NoteDraft = {
  title: string;
  content: string;
  documentType: DocumentType;
  secret: string;
  attachment: NoteAttachment | null;
};

export function NoteFormSheet({
  onClose,
  onSubmit,
  visible,
}: {
  onClose: () => void;
  onSubmit: (draft: NoteDraft) => Promise<void>;
  visible: boolean;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("note");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [attachment, setAttachment] = useState<NoteAttachment | null>(null);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCredentials = documentType === "credentials";

  const reset = useCallback(() => {
    setTitle("");
    setContent("");
    setDocumentType("note");
    setSecret("");
    setUrl("");
    setUsername("");
    setShowSecret(false);
    setAttachment(null);
    setError(null);
  }, []);

  const close = useCallback(() => {
    if (saving) return;
    reset();
    onClose();
  }, [onClose, reset, saving]);

  const chooseType = useCallback((type: DocumentType) => {
    setDocumentType(type);
    setTypePickerVisible(false);
    if (type !== "credentials") {
      setSecret("");
      setUrl("");
      setUsername("");
      setShowSecret(false);
    }
  }, []);

  const selectImage = useCallback(async (camera: boolean) => {
    setError(null);
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(camera
        ? "Bitte erlaube den Kamerazugriff, um ein Foto anzuhängen."
        : "Bitte erlaube den Fotozugriff, um ein Bild anzuhängen.");
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;
    setAttachment({
      uri: asset.uri,
      name: asset.fileName || `Notiz-${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
  }, []);

  const submit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim();
    if (!trimmedTitle) {
      setError(isCredentials ? "Bitte gib einen Namen ein." : "Bitte gib einen Titel ein.");
      return;
    }
    if (!isCredentials && !trimmedContent) {
      setError("Bitte schreib etwas in die Notiz.");
      return;
    }
    if (
      isCredentials
      && !trimmedContent
      && !trimmedUrl
      && !trimmedUsername
      && !secret
    ) {
      setError("Bitte gib mindestens URL, Benutzername, Passwort oder Beschreibung an.");
      return;
    }
    const credentialContent = isCredentials
      ? buildCredentialsContent({
          title: trimmedTitle,
          url: trimmedUrl,
          username: trimmedUsername,
          description: trimmedContent,
        })
      : trimmedContent;
    if (credentialContent.length > maxNoteContentLength) {
      setError("Die Zugangsdaten sind insgesamt zu lang. Bitte kürz die Beschreibung etwas.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: trimmedTitle,
        content: credentialContent,
        documentType,
        secret,
        attachment,
      });
      reset();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Die Notiz konnte nicht gespeichert werden. Bitte versuch es nochmal.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    attachment,
    content,
    documentType,
    isCredentials,
    onClose,
    onSubmit,
    reset,
    secret,
    title,
    url,
    username,
  ]);

  return (
    <>
      <OrdiloFormSheet
        closeAccessibilityLabel="Notiz schließen"
        dismissDisabled={saving}
        keyboardAvoiding
        onClose={close}
        style={styles.sheet}
        subtitle="Für alles, was ihr euch merken möchtet."
        title="Notiz schreiben"
        visible={visible}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
            <Field label={isCredentials ? "Name" : "Titel"}>
              <TextInput
                accessibilityLabel={isCredentials ? "Name der Zugangsdaten" : "Titel der Notiz"}
                maxLength={200}
                onChangeText={setTitle}
                placeholder={isCredentials ? "z. B. WLAN oder Netflix" : "z. B. Abholzeit Kita"}
                placeholderTextColor={colors.mistDark}
                style={styles.input}
                value={title}
              />
            </Field>
            <Field label="Art">
              <Pressable
                accessibilityHint="Öffnet die Auswahl für die Art der Notiz"
                accessibilityLabel={`Art: ${documentTypeLabels[documentType]}`}
                accessibilityRole="button"
                onPress={() => setTypePickerVisible(true)}
                style={({ pressed }) => [styles.typeButton, pressed && styles.pressed]}
              >
                <FileText color={colors.mistDark} size={18} />
                <Text style={styles.typeText}>{documentTypeLabels[documentType]}</Text>
              </Pressable>
            </Field>
            {isCredentials ? (
              <>
                <Field label="URL">
                  <TextInput
                    accessibilityLabel="URL"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    maxLength={500}
                    onChangeText={setUrl}
                    placeholder="https://…"
                    placeholderTextColor={colors.mistDark}
                    style={styles.input}
                    value={url}
                  />
                </Field>
                <Field label="Benutzername">
                  <TextInput
                    accessibilityLabel="Benutzername"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={200}
                    onChangeText={setUsername}
                    placeholder="familie@example.de"
                    placeholderTextColor={colors.mistDark}
                    style={styles.input}
                    value={username}
                  />
                </Field>
                <Field label="Passwort">
                  <View style={styles.secretField}>
                    <KeyRound color={colors.mistDark} size={18} />
                    <TextInput
                      accessibilityLabel="Passwort"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={10_000}
                      onChangeText={setSecret}
                      placeholder="Passwort, PIN oder Code"
                      placeholderTextColor={colors.mistDark}
                      secureTextEntry={!showSecret}
                      style={styles.secretInput}
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
                  <Text style={styles.helper}>
                    Wird verschlüsselt gespeichert und erst auf Wunsch gezeigt.
                  </Text>
                </Field>
              </>
            ) : null}
            <Field label={isCredentials ? "Beschreibung" : "Notiz"}>
              <TextInput
                accessibilityLabel={isCredentials ? "Beschreibung" : "Inhalt der Notiz"}
                maxLength={10_000}
                multiline
                onChangeText={setContent}
                placeholder={isCredentials ? "Wer nutzt den Zugang? Was ist wichtig?" : "Schreib auf, was wichtig ist …"}
                placeholderTextColor={colors.mistDark}
                style={[styles.input, styles.textarea]}
                textAlignVertical="top"
                value={content}
              />
            </Field>
            {attachment ? (
              <View style={styles.attachment}>
                <Image accessibilityLabel="Angehängtes Bild" source={{ uri: attachment.uri }} style={styles.preview} />
                <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                <Pressable
                  accessibilityLabel="Angehängtes Bild entfernen"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setAttachment(null)}
                >
                  <X color={colors.destructive} size={20} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.imageActions}>
                <OrdiloButton
                  icon={<Camera color={colors.graphite} size={17} />}
                  onPress={() => void selectImage(true)}
                  title="Foto"
                  variant="outline"
                />
                <OrdiloButton
                  icon={<ImagePlus color={colors.graphite} size={17} />}
                  onPress={() => void selectImage(false)}
                  title="Bild"
                  variant="outline"
                />
              </View>
            )}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <OrdiloButton disabled={saving} onPress={close} title="Abbrechen" variant="outline" />
          <OrdiloButton
            disabled={saving}
            icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
            onPress={() => void submit()}
            title={saving ? "Wird gespeichert …" : "Speichern"}
          />
        </View>
      </OrdiloFormSheet>
      <NoteTypePicker
        onClose={() => setTypePickerVisible(false)}
        onSelect={chooseType}
        selected={documentType}
        visible={typePickerVisible}
      />
    </>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function NoteTypePicker({
  onClose,
  onSelect,
  selected,
  visible,
}: {
  onClose: () => void;
  onSelect: (type: DocumentType) => void;
  selected: DocumentType;
  visible: boolean;
}) {
  return (
    <OrdiloPickerSheet
      accessibilityLabel="Art der Notiz auswählen"
      onClose={onClose}
      options={noteTypes.map(([type, label]) => ({
        key: type,
        label,
        onPress: () => onSelect(type),
        selected: selected === type,
      }))}
      title="Art wählen"
      visible={visible}
    />
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: "90%" },
  form: { gap: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.md },
  field: { gap: spacing.xs },
  label: { color: colors.graphite, ...typography.label },
  input: { borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, minHeight: 44, paddingHorizontal: 12, ...typography.body },
  textarea: { minHeight: 130, paddingTop: 10 },
  typeButton: { alignItems: "center", borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, flexDirection: "row", gap: spacing.sm, height: 44, paddingHorizontal: 12 },
  typeText: { color: colors.graphite, ...typography.body },
  secretField: { alignItems: "center", borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: 12 },
  secretInput: { color: colors.graphite, flex: 1, minHeight: 44, ...typography.body },
  helper: { color: colors.mistDark, ...typography.label },
  imageActions: { flexDirection: "row", gap: spacing.sm },
  attachment: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  preview: { borderRadius: radii.base, height: 44, width: 44 },
  attachmentName: { color: colors.graphite, flex: 1, ...typography.timestamp },
  error: { color: colors.destructive, ...typography.timestamp },
  footer: { borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", paddingTop: spacing.md },
  pressed: { opacity: 0.76 },
});
