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
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { OrdiloPickerOverlay } from "@/src/components/picker-sheet";
import {
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormInput,
  OrdiloFormSelect,
  OrdiloFormSheet,
} from "@/src/components/sheet";
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
    <OrdiloFormSheet
        closeAccessibilityLabel="Notiz schließen"
        dismissDisabled={saving}
        keyboardAvoiding
        onClose={close}
        subtitle="Für alles, was ihr euch merken möchtet."
        title="Notiz schreiben"
        visible={visible}
      >
        <OrdiloFormBody>
            <OrdiloFormField label={isCredentials ? "Name" : "Titel"}>
              <OrdiloFormInput
                accessibilityLabel={isCredentials ? "Name der Zugangsdaten" : "Titel der Notiz"}
                maxLength={200}
                onChangeText={setTitle}
                placeholder={isCredentials ? "z. B. WLAN oder Netflix" : "z. B. Abholzeit Kita"}
                value={title}
              />
            </OrdiloFormField>
            <OrdiloFormField label="Art">
              <OrdiloFormSelect
                accessibilityHint="Öffnet die Auswahl für die Art der Notiz"
                accessibilityLabel={`Art: ${documentTypeLabels[documentType]}`}
                leading={<FileText color={colors.mistDark} size={18} />}
                onPress={() => setTypePickerVisible(true)}
                value={documentTypeLabels[documentType]}
              />
            </OrdiloFormField>
            {isCredentials ? (
              <>
                <OrdiloFormField label="URL">
                  <OrdiloFormInput
                    accessibilityLabel="URL"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    maxLength={500}
                    onChangeText={setUrl}
                    placeholder="https://…"
                    value={url}
                  />
                </OrdiloFormField>
                <OrdiloFormField label="Benutzername">
                  <OrdiloFormInput
                    accessibilityLabel="Benutzername"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={200}
                    onChangeText={setUsername}
                    placeholder="familie@example.de"
                    value={username}
                  />
                </OrdiloFormField>
                <OrdiloFormField
                  helper="Wird verschlüsselt gespeichert und erst auf Wunsch gezeigt."
                  label="Passwort"
                >
                  <OrdiloFormInput
                    accessibilityLabel="Passwort"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leading={<KeyRound color={colors.mistDark} size={18} />}
                    maxLength={10_000}
                    onChangeText={setSecret}
                    placeholder="Passwort, PIN oder Code"
                    secureTextEntry={!showSecret}
                    trailing={
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
                    }
                    value={secret}
                  />
                </OrdiloFormField>
              </>
            ) : null}
            <OrdiloFormField label={isCredentials ? "Beschreibung" : "Notiz"}>
              <OrdiloFormInput
                accessibilityLabel={isCredentials ? "Beschreibung" : "Inhalt der Notiz"}
                maxLength={10_000}
                multiline
                onChangeText={setContent}
                placeholder={isCredentials ? "Wer nutzt den Zugang? Was ist wichtig?" : "Schreib auf, was wichtig ist …"}
                value={content}
              />
            </OrdiloFormField>
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
        </OrdiloFormBody>
        <OrdiloFormFooter
          error={error}
          primary={<OrdiloButton
            disabled={saving}
            icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
            onPress={() => void submit()}
            size="lg"
            title={saving ? "Wird gespeichert …" : "Speichern"}
          />}
          secondary={<OrdiloButton disabled={saving} onPress={close} size="lg" title="Abbrechen" variant="outline" />}
        />
      <NoteTypePicker
        onClose={() => setTypePickerVisible(false)}
        onSelect={chooseType}
        selected={documentType}
        visible={typePickerVisible}
      />
    </OrdiloFormSheet>
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
    <OrdiloPickerOverlay
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
  imageActions: { flexDirection: "row", gap: spacing.sm },
  attachment: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  preview: { borderRadius: radii.base, height: 44, width: 44 },
  attachmentName: { color: colors.graphite, flex: 1, ...typography.timestamp },
  pressed: { opacity: 0.76 },
});
