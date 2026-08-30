import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { fail, select, success } from "@/src/lib/feedback";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  ListChecks,
  Lock,
  Pencil,
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";

import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { SwipeImagePreview } from "@/src/components/swipe-image-preview";
import { Card, DetailTopBar, EmptyState, ListSkeleton, OrdiloButton, Screen } from "@/src/components/ui";
import { OrdiloMark } from "@/src/components/ordilo-mark";
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
import { contentEntering } from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Icon = typeof Tag;

export default function DocumentReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, source } = useLocalSearchParams<{
    id: string;
    source?: string;
  }>();
  const [document, setDocument] = useState<DocumentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDocumentDetails, setShowDocumentDetails] = useState(false);
  const [scanConfirmed, setScanConfirmed] = useState(false);

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
      if (value && source === "scan" && canReviewDocument(value.status)) {
        setEditing(true);
      }
      if (!value) setError("Das Dokument wurde nicht gefunden oder kann gerade nicht geladen werden.");
    } catch {
      setDocument(null);
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
    } finally {
      setLoading(false);
    }
  }, [id, source]);

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
        if (value && source === "scan" && canReviewDocument(value.status)) {
          setEditing(true);
        }
        if (!value) setError("Das Dokument wurde nicht gefunden oder kann gerade nicht geladen werden.");
      })
      .catch(() => {
        setDocument(null);
        setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
      })
      .finally(() => setLoading(false));
  }, [id, source]);

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
      await success();
      if (source === "scan") {
        setScanConfirmed(true);
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      await fail();
      Alert.alert("Nicht gespeichert", "Bitte prüfe deine Verbindung und versuch es nochmal.");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = () => {
    if (!document || !id || deleting) return;
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const removeDocument = async () => {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    removeLibraryDocumentOptimistically(id);
    try {
      await deleteDocument(id);
      await success();
      router.back();
    } catch {
      await fail();
      setDeleteError("Das Dokument konnte nicht gelöscht werden. Bitte prüfe deine Verbindung und versuch es nochmal.");
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
      await fail();
      Alert.alert(
        "Original nicht verfügbar",
        "Die Datei konnte nicht geöffnet werden. Bitte versuch es später nochmal.",
      );
    } finally {
      setOpeningOriginal(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.screen}>
        <DetailTopBar onBack={() => router.back()} title="Dokument" />
        <View style={styles.loadingContent}>
          <ListSkeleton rows={4} />
        </View>
      </Screen>
    );
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

  if (scanConfirmed) {
    return (
      <Screen
        style={[
          styles.confirmedScreen,
          {
            paddingBottom: Math.max(insets.bottom, spacing.md),
            paddingTop: insets.top,
          },
        ]}
      >
        <Animated.View
          entering={contentEntering()}
          style={styles.confirmedContent}
        >
          <View style={styles.confirmedCharacter}>
            <OrdiloCharacter animated size={112} />
            <View style={styles.confirmedCheck}>
              <Check color={colors.warmWhite} size={20} strokeWidth={3} />
            </View>
          </View>
          <Text style={styles.confirmedEyebrow}>Im Familienbuch</Text>
          <Text style={styles.confirmedHeading}>Alles sicher abgelegt</Text>
          <Text style={styles.confirmedCopy}>
            Du hast das Dokument geprüft. Jetzt kann deine Familie es jederzeit wiederfinden.
          </Text>
          <Card style={styles.confirmedDocument}>
            <FileText color={colors.harborBlue} size={22} />
            <Text numberOfLines={2} style={styles.confirmedDocumentTitle}>
              {document.title}
            </Text>
          </Card>
        </Animated.View>
        <View style={styles.confirmedActions}>
          <OrdiloButton
            onPress={() => router.replace("/scan")}
            size="lg"
            title="Nächstes scannen"
          />
          <OrdiloButton
            onPress={() => router.replace("/(tabs)")}
            size="lg"
            title="Fertig"
            variant="outline"
          />
        </View>
      </Screen>
    );
  }

  const deleteDialog = (
    <ConfirmDialog
      error={deleteError}
      loading={deleting}
      loadingLabel="Wird gelöscht …"
      message={`"${document.title?.trim() || "Dieses Dokument"}" wird aus eurer Ablage gelöscht. Das kannst du nicht rückgängig machen.`}
      onCancel={() => setDeleteOpen(false)}
      onConfirm={() => void removeDocument()}
      title="Dokument löschen?"
      visible={deleteOpen}
    />
  );

  if (!("summary" in document)) {
    return (
      <>
        <UnavailableState
          deleting={deleting}
          document={document}
          onBack={() => router.replace("/(tabs)")}
          onDelete={requestDelete}
        />
        {deleteDialog}
      </>
    );
  }

  const isReadOnly = document.status === "confirmed";
  const editable = canReviewDocument(document.status);

  return (
    <Screen style={styles.screen}>
      <DetailTopBar
        onBack={() => router.back()}
        subtitle={`Hinzugefügt am ${formatDetailDate(document.created_at)} · ${document.suggested_category || documentTypeLabels[document.document_type]}`}
        title={isReadOnly ? "Dokument" : "Dokument prüfen"}
        trailing={(
          <Pressable
            accessibilityLabel="Dokument löschen"
            accessibilityRole="button"
            hitSlop={8}
            onPress={requestDelete}
            style={styles.headerAction}
          >
            <Trash2 color={colors.destructive} size={20} />
          </Pressable>
        )}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: !editing ? 76 + insets.bottom : spacing["2xl"] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={contentEntering()}
          key={editing ? "document-editor" : "document-overview"}
          style={[styles.contentState, !editing && styles.overviewContent]}
        >
        {!editing ? (
          <>
            <DocumentHero document={document} />
            <ExtractionOverview document={document} />
            <Card style={styles.detailCard}>
              <DetailLink
                accessibilityLabel={editable ? "Extrahierte Angaben prüfen" : "Extrahierte Angaben ansehen"}
                description="Name, Termine und mehr"
                onPress={() => setEditing(true)}
                title={editable ? "Extrahierte Angaben prüfen" : "Extrahierte Angaben ansehen"}
              />
              <DetailLink
                accessibilityLabel="Dokumentdetails anzeigen"
                description={document.original_filename ?? "Datei und Format"}
                onPress={() => setShowDocumentDetails((current) => !current)}
                separated
                title="Dokumentdetails"
              />
            </Card>
            {showDocumentDetails ? <DocumentMetadata document={document} /> : null}
            <View style={styles.aiNotice}>
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={styles.aiIcon}
              >
                <OrdiloMark size={28} />
              </View>
              <Text style={styles.aiNoticeText}>
                Ordilo hat die wichtigsten Informationen für dich herausgesucht. Bitte prüfe, ob alles stimmt.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.editIntro}>
              <Text style={styles.editTitle}>Angaben prüfen</Text>
              <Text style={styles.editHelp}>Ändere nur, was nicht stimmt. Danach kannst du das Dokument speichern.</Text>
            </View>

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
                  <OrdiloButton title="Zurück zur Übersicht" variant="ghost" onPress={() => setEditing(false)} />
                </>
              )}
            </View>
          </>
        )}
        </Animated.View>
      </ScrollView>
      {!editing ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
          <Pressable
            accessibilityHint="Öffnet das gespeicherte Original."
            accessibilityLabel="Original ansehen"
            accessibilityRole="button"
            disabled={openingOriginal}
            onPress={() => void viewOriginal()}
            style={({ pressed }) => [styles.bottomAction, pressed && styles.pressed, openingOriginal && styles.disabled]}
          >
            {openingOriginal ? <ActivityIndicator color={colors.harborBlue} size="small" /> : <Eye color={colors.harborBlue} size={19} />}
            <Text style={styles.bottomActionText}>{openingOriginal ? "Wird geöffnet …" : "Original ansehen"}</Text>
          </Pressable>
          <View style={styles.bottomDivider} />
          <Pressable
            accessibilityLabel="Dokument bearbeiten"
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={({ pressed }) => [styles.bottomAction, pressed && styles.pressed]}
          >
            <Pencil color={colors.harborBlue} size={19} />
            <Text style={styles.bottomActionText}>{editable ? "Bearbeiten" : "Angaben ansehen"}</Text>
          </Pressable>
        </View>
      ) : null}

      {deleteDialog}

      <OriginalImagePreview imageUrl={imageUrl} onClose={() => setImageUrl(null)} />
    </Screen>
  );
}

function UnavailableState({
  deleting,
  document,
  onBack,
  onDelete,
}: {
  deleting: boolean;
  document: Exclude<DocumentReview, ReviewAnalysis>;
  onBack: () => void;
  onDelete: () => void;
}) {
  const failed = document.status === "failed";
  const processing = ["uploaded", "ocr_processing", "ocr_done", "analyzing"].includes(document.status);
  return (
    <Screen>
      <DetailTopBar onBack={onBack} title="Dokument" />
      <EmptyState
        icon={failed ? AlertCircle : FileText}
        heading={failed ? "Das hat nicht geklappt" : processing ? "Dokument wird vorbereitet" : "Noch nicht bereit"}
        description={failed
          ? "Die Verarbeitung dieses Dokuments ist fehlgeschlagen. Du kannst es später noch einmal scannen."
          : "Ordilo bereitet das Dokument gerade vor. Schau in einem Moment noch einmal vorbei."}
      >
        <OrdiloButton title="Zur Übersicht" size="lg" onPress={onBack} />
        {failed ? (
          <Pressable
            accessibilityLabel="Fehlgeschlagenes Dokument löschen"
            accessibilityRole="button"
            disabled={deleting}
            onPress={onDelete}
            style={({ pressed }) => [
              styles.deleteDocument,
              pressed && styles.pressed,
              deleting && styles.disabled,
            ]}
          >
            {deleting ? (
              <ActivityIndicator color={colors.destructive} size="small" />
            ) : (
              <Trash2 color={colors.destructive} size={18} />
            )}
            <Text style={styles.deleteDocumentText}>
              {deleting ? "Dokument wird gelöscht …" : "Dokument löschen"}
            </Text>
          </Pressable>
        ) : null}
      </EmptyState>
    </Screen>
  );
}

function DocumentHero({ document }: { document: ReviewAnalysis }) {
  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroHeading}>
        <View style={styles.heroFileIcon}><FileText color={colors.harborBlue} size={28} strokeWidth={1.7} /></View>
        <View style={styles.heroCopy}>
          <View style={styles.typeChip}><Text style={styles.typeChipText}>{documentTypeLabels[document.document_type]}</Text></View>
          <Text style={styles.documentTitle}>{document.title}</Text>
        </View>
      </View>
      {document.summary ? <Text numberOfLines={3} style={styles.documentSummary}>{document.summary}</Text> : null}
    </Card>
  );
}

function ExtractionOverview({ document }: { document: ReviewAnalysis }) {
  const rows = [
    ...document.dates.slice(0, 2).map((date) => ({
      icon: CalendarDays,
      label: date.label || "Termin",
      value: formatExtractedDate(date.date),
    })),
    ...document.tasks.slice(0, 2).map((task) => ({
      icon: ListChecks,
      label: task.title || "Aufgabe",
      value: task.due_date ? formatExtractedDate(task.due_date) : "Ohne Datum",
    })),
  ].slice(0, 3);

  return (
    <Card style={styles.overviewCard}>
      <Text style={styles.overviewTitle}>Das Wichtigste auf einen Blick</Text>
      {rows.length > 0 ? rows.map((row, index) => {
        const IconComponent = row.icon;
        return (
          <View key={`${row.label}-${index}`} style={[styles.overviewRow, index > 0 && styles.overviewRowBorder]}>
            <View style={styles.overviewIcon}><IconComponent color={colors.harborBlue} size={19} strokeWidth={1.8} /></View>
            <View style={styles.overviewCopy}>
              <Text numberOfLines={1} style={styles.overviewLabel}>{row.label}</Text>
              <Text numberOfLines={1} style={styles.overviewValue}>{row.value}</Text>
            </View>
          </View>
        );
      }) : (
        <Text style={styles.overviewEmpty}>Keine Termine oder Aufgaben erkannt.</Text>
      )}
      {document.needs_user_review ? (
        <View accessibilityRole="alert" style={[styles.overviewRow, rows.length > 0 && styles.overviewRowBorder]}>
          <View style={[styles.overviewIcon, styles.reviewIcon]}><CircleAlert color={colors.warmApricot} size={19} strokeWidth={1.8} /></View>
          <View style={styles.overviewCopy}>
            <Text style={styles.reviewLabel}>Noch auszufüllen</Text>
            <Text numberOfLines={1} style={styles.overviewValue}>Ein paar Angaben sind unsicher</Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function DetailLink({
  accessibilityLabel,
  description,
  onPress,
  separated = false,
  title,
}: {
  accessibilityLabel: string;
  description: string;
  onPress: () => void;
  separated?: boolean;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.detailLink, separated && styles.detailLinkSeparated, pressed && styles.pressed]}
    >
      <View style={styles.detailLinkIcon}><FileText color={colors.graphite} size={20} strokeWidth={1.7} /></View>
      <View style={styles.detailLinkCopy}>
        <Text style={styles.detailLinkTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.detailLinkDescription}>{description}</Text>
      </View>
      <ChevronRight color={colors.graphite} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

function OriginalImagePreview({ imageUrl, onClose }: { imageUrl: string | null; onClose: () => void }) {
  return imageUrl ? <SwipeImagePreview imageUrl={imageUrl} onClose={onClose} /> : null;
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
  const copiedSecretRef = useRef<string | null>(null);

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
    const copiedSecret = copiedSecretRef.current;
    if (copiedSecret) {
      void Clipboard.getStringAsync()
        .then((clipboard) =>
          clipboard === copiedSecret ? Clipboard.setStringAsync("") : undefined,
        )
        .catch(() => undefined);
    }
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
    copiedSecretRef.current = secret;
    setCopied(true);
    armSecretExpiry();
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
    if (clipboardClearTimer.current) clearTimeout(clipboardClearTimer.current);
    clipboardClearTimer.current = setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((clipboard) => clipboard === secret ? Clipboard.setStringAsync("") : undefined)
        .finally(() => {
          copiedSecretRef.current = null;
        })
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

function formatExtractedDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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
  select();
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
  select();
  onChange((current) => ({ ...current, tags: [...current.tags, tag] }));
  setTagDraft("");
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  confirmedScreen: { justifyContent: "space-between" },
  confirmedContent: {
    alignItems: "center",
    alignSelf: "center",
    gap: spacing.sm,
    maxWidth: 420,
    width: "100%",
  },
  confirmedCharacter: {
    alignItems: "center",
    height: 144,
    justifyContent: "center",
    position: "relative",
  },
  confirmedCheck: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: colors.warmWhite,
    borderRadius: radii.pill,
    borderWidth: 3,
    bottom: 10,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: 5,
    width: 40,
  },
  confirmedEyebrow: { color: colors.harborBlue, ...typography.label },
  confirmedHeading: {
    ...typography.display,
    color: colors.harborBlueDarker,
    fontSize: 25,
    lineHeight: 32,
    textAlign: "center",
  },
  confirmedCopy: {
    color: colors.mistDark,
    maxWidth: 340,
    textAlign: "center",
    ...typography.body,
  },
  confirmedDocument: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    maxWidth: 360,
    width: "100%",
  },
  confirmedDocumentTitle: { color: colors.graphite, flex: 1, ...typography.title },
  confirmedActions: { gap: spacing.sm },
  loadingContent: { paddingHorizontal: spacing.md },
  headerAction: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: 104 },
  contentState: { gap: spacing.md },
  overviewContent: { gap: spacing.md },
  intro: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  introCopy: { flex: 1 },
  fileIcon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 48, justifyContent: "center", width: 48 },
  type: { color: colors.graphite, ...typography.title },
  help: { color: colors.mistDark, ...typography.timestamp, marginTop: 2 },
  heroCard: { gap: spacing.md, padding: spacing.md },
  heroHeading: { flexDirection: "row", gap: 12 },
  heroFileIcon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 52, justifyContent: "center", width: 52 },
  heroCopy: { flex: 1, gap: 3, minWidth: 0 },
  typeChip: { alignSelf: "flex-start", backgroundColor: colors.sandLight, borderRadius: radii.base, paddingHorizontal: 6, paddingVertical: 3 },
  typeChipText: { color: colors.harborBlue, ...typography.label },
  documentTitle: { color: colors.graphite, ...typography.display },
  documentSummary: { color: colors.graphite, ...typography.body },
  overviewCard: { gap: 0, paddingVertical: spacing.sm },
  overviewTitle: { color: colors.graphite, marginBottom: spacing.sm, paddingHorizontal: spacing.md, ...typography.title },
  overviewRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md },
  overviewRowBorder: { borderTopColor: colors.mistLight, borderTopWidth: 1 },
  overviewIcon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 36, justifyContent: "center", width: 36 },
  overviewCopy: { flex: 1, gap: 1, minWidth: 0 },
  overviewLabel: { color: colors.graphite, ...typography.title },
  overviewValue: { color: colors.graphite, ...typography.timestamp },
  overviewEmpty: { color: colors.mistDark, paddingHorizontal: spacing.md, ...typography.timestamp },
  reviewIcon: { backgroundColor: colors.sandWarm },
  reviewLabel: { color: colors.warmApricot, ...typography.title },
  detailCard: { gap: 0, paddingVertical: 0 },
  detailLink: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 68, paddingHorizontal: spacing.md },
  detailLinkSeparated: { borderTopColor: colors.mistLight, borderTopWidth: 1 },
  detailLinkIcon: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, height: 36, justifyContent: "center", width: 36 },
  detailLinkCopy: { flex: 1, gap: 1, minWidth: 0 },
  detailLinkTitle: { color: colors.graphite, ...typography.title },
  detailLinkDescription: { color: colors.mistDark, ...typography.timestamp },
  aiNotice: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  aiIcon: { alignItems: "center", backgroundColor: colors.warmWhite, borderRadius: radii.pill, height: 36, justifyContent: "center", width: 36 },
  aiNoticeText: { color: colors.graphite, flex: 1, ...typography.timestamp },
  editIntro: { gap: 2, paddingVertical: spacing.xs },
  editTitle: { color: colors.graphite, ...typography.display },
  editHelp: { color: colors.mistDark, ...typography.timestamp },
  metadataCard: { gap: 0 },
  metadataRow: { alignItems: "baseline", borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 38, paddingVertical: spacing.sm },
  metadataLabel: { color: colors.mistDark, minWidth: 92, ...typography.label },
  metadataValue: { color: colors.graphite, flex: 1, textAlign: "right", ...typography.timestamp },
  bottomBar: { alignItems: "center", backgroundColor: colors.warmWhite, borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", minHeight: 68, paddingBottom: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  bottomAction: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, height: 44, justifyContent: "center" },
  bottomActionText: { color: colors.harborBlue, ...typography.title },
  bottomDivider: { backgroundColor: colors.mistLight, height: 28, width: 1 },
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
});
