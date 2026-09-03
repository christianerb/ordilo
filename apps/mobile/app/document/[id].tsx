import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Hash,
  KeyRound,
  ListChecks,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Tag,
  Trash2,
  UserRound,
  Wallet,
  WalletCards,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { CreateChoiceSheet } from "@/src/components/create-choice-sheet";
import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import { PersonChip } from "@/src/components/person";
import type { OrdiloSheetHandle } from "@/src/components/sheet";
import { SwipeImagePreview } from "@/src/components/swipe-image-preview";
import {
  Card,
  DetailTopBar,
  EmptyState,
  IconButton,
  IconTile,
  ListGroup,
  ListRow,
  ListSkeleton,
  OrdiloButton,
  Screen,
  SectionHeader,
} from "@/src/components/ui";
import { getDocumentKind } from "@/src/lib/document-kind";
import {
  calendarEligibleDateIndices,
  canReviewDocument,
  confirmDocumentReview,
  defaultCalendarDateIndices,
  deleteDocument,
  documentTypeLabels,
  getDocumentConsequences,
  isImageFile,
  loadDocumentReview,
  loadOriginalFile,
  parseCredentialFields,
  remapCalendarSelection,
  revealDocumentSecret,
  type ConfirmDocumentResult,
  type DocumentConsequence,
  type DocumentReview,
  type ReviewAnalysis,
} from "@/src/lib/document-review";
import { useFamily } from "@/src/lib/family-context";
import { fail, select, success, tap } from "@/src/lib/feedback";
import {
  refreshLibraryDocuments,
  removeLibraryDocumentOptimistically,
} from "@/src/lib/library";
import { resolveDocumentPeople, type Person } from "@/src/lib/people";
import { fetchFamilyMembers, type FamilyMemberOption } from "@/src/lib/tasks";
import { contentEntering } from "@/src/theme/motion";
import { colors, radii, sizes, spacing, typography } from "@/src/theme/tokens";

type Icon = typeof Tag;

/**
 * A document, understood first. The screen leads with what Ordilo made of
 * it — title, one-line meaning, whom it concerns — and then "was das
 * bedeutet": dates (each one can go straight into the family calendar),
 * tasks, amounts and numbers worth copying. The file itself stays one tap
 * away but never comes first. A freshly read document is confirmed with
 * one "Passt so"; corrections live one level deeper.
 */
export default function DocumentReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { family } = useFamily();
  const { id, source } = useLocalSearchParams<{
    id: string;
    source?: string;
  }>();
  const [document, setDocument] = useState<DocumentReview | null>(null);
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDocumentDetails, setShowDocumentDetails] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [calendarDates, setCalendarDates] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState<ConfirmDocumentResult | null>(null);
  const menuRef = useRef<OrdiloSheetHandle>(null);
  const pendingMenuRef = useRef<"original" | "edit" | "delete" | null>(null);

  const applyLoaded = useCallback(
    (value: DocumentReview | null) => {
      setDocument(value);
      if (value && source === "scan" && canReviewDocument(value.status)) {
        // A fresh scan starts in the overview too: the family confirms what
        // Ordilo read before they correct anything.
        setEditing(false);
      }
      if (value && "dates" in value && canReviewDocument(value.status)) {
        // Appointments Ordilo read with confidence are offered for the
        // calendar by default. Deadlines („Zahlungsfrist“), past dates and
        // unsure ones wait for a deliberate tap — same defaults as the web.
        setCalendarDates(new Set(defaultCalendarDateIndices(value.dates)));
      }
      if (!value) setError("Das Dokument wurde nicht gefunden oder kann gerade nicht geladen werden.");
    },
    [source],
  );

  const load = useCallback(async () => {
    if (!id) {
      setError("Das Dokument fehlt.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      applyLoaded(await loadDocumentReview(id));
    } catch {
      setDocument(null);
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
    } finally {
      setLoading(false);
    }
  }, [applyLoaded, id]);

  useEffect(() => {
    if (!id) {
      void Promise.resolve().then(() => {
        setError("Das Dokument fehlt.");
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    void loadDocumentReview(id)
      .then((value) => {
        if (!cancelled) applyLoaded(value);
      })
      .catch(() => {
        if (cancelled) return;
        setDocument(null);
        setError("Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyLoaded, id]);

  useEffect(() => {
    if (!family) return;
    let cancelled = false;
    void fetchFamilyMembers(family.id)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [family]);

  // Images get an inline thumbnail: seeing the letter is part of
  // understanding it. PDFs keep the explicit "Original ansehen".
  // Keyed by the document's id and type, not by the document itself:
  // otherwise every keystroke in the editor would sign a new file URL.
  const documentMimeType = document && "mime_type" in document ? document.mime_type : null;
  useEffect(() => {
    if (!id || !documentMimeType || !isImageFile(documentMimeType)) return;
    let cancelled = false;
    void loadOriginalFile(id)
      .then((file) => {
        if (!cancelled && isImageFile(file.mimeType)) setThumbnailUrl(file.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentMimeType, id]);

  const updateAnalysis = (updater: (current: ReviewAnalysis) => ReviewAnalysis) => {
    setDocument((current) => current && "summary" in current ? updater(current) : current);
  };

  const confirm = async () => {
    if (!document || !("summary" in document) || !canReviewDocument(document.status) || !id) return;
    if (!document.title.trim()) {
      Alert.alert("Titel fehlt", "Gib dem Dokument einen kurzen Namen, damit ihr es später wiederfindet.");
      setEditing(true);
      return;
    }
    setSaving(true);
    try {
      const result = await confirmDocumentReview(id, document, {
        calendarDateIndices: [...calendarDates].filter((index) => calendarEligible.has(index)),
      });
      await success();
      refreshLibraryDocuments();
      setConfirmed(result);
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
    if (thumbnailUrl) {
      setImageUrl(thumbnailUrl);
      return;
    }
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

  const chooseMenu = (choice: "original" | "edit" | "delete") => {
    pendingMenuRef.current = choice;
    menuRef.current?.dismiss();
  };
  const finishMenu = () => {
    const choice = pendingMenuRef.current;
    pendingMenuRef.current = null;
    if (choice === "original") void viewOriginal();
    if (choice === "edit") setEditing(true);
    if (choice === "delete") requestDelete();
  };

  // Which dates may become planner events at all — the Kalender toggle is
  // only offered for these, and only these are submitted on confirm. A
  // handful of dates, so no memo: the React Compiler owns this render.
  const calendarEligible = new Set(
    document && "dates" in document ? calendarEligibleDateIndices(document.dates) : [],
  );

  const removeDateAt = (index: number) => {
    setCalendarDates((current) => remapCalendarSelection(current, index));
  };

  const toggleCalendarDate = (index: number) => {
    select();
    setCalendarDates((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const people: Person[] = useMemo(
    () =>
      document && "family_members" in document
        ? resolveDocumentPeople(
            document.family_members.map((member) => ({
              entity_value: member.name,
              linked_object_id: member.person_id,
            })),
            members,
          )
        : [],
    [document, members],
  );
  const consequences = useMemo(
    () => (document && "summary" in document ? getDocumentConsequences(document) : []),
    [document],
  );

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
        <DetailTopBar onBack={() => router.back()} title="Dokument" />
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

  if (confirmed) {
    const outcome = [
      confirmed.eventsCreated === 1
        ? "1 Termin im Kalender"
        : confirmed.eventsCreated > 1
          ? `${confirmed.eventsCreated} Termine im Kalender`
          : null,
      confirmed.tasksKept === 1
        ? "1 Aufgabe auf der Liste"
        : confirmed.tasksKept > 1
          ? `${confirmed.tasksKept} Aufgaben auf der Liste`
          : null,
    ].filter(Boolean);
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
            {outcome.length > 0
              ? `Ordilo hat sich das gemerkt: ${outcome.join(" und ")}.`
              : "Deine Familie kann das Dokument jetzt jederzeit wiederfinden."}
          </Text>
          <Card style={styles.confirmedDocument}>
            <FileText color={colors.harborBlue} size={22} />
            <Text numberOfLines={2} style={styles.confirmedDocumentTitle}>
              {document.title}
            </Text>
          </Card>
        </Animated.View>
        <View style={styles.confirmedActions}>
          {source === "scan" ? (
            <OrdiloButton
              onPress={() => router.replace({ pathname: "/scan", params: { auto: "1" } })}
              size="lg"
              title="Nächstes scannen"
            />
          ) : null}
          <OrdiloButton
            onPress={() => router.replace("/(tabs)")}
            size="lg"
            title="Fertig"
            variant={source === "scan" ? "outline" : "primary"}
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
      message={`„${document.title?.trim() || "Dieses Dokument"}“ wird aus eurer Ablage gelöscht. Das kannst du nicht rückgängig machen.`}
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
  const kind = getDocumentKind(document.document_type);
  const KindIcon = kind.icon;
  const summaryLong = document.summary.length > 180;

  return (
    <Screen style={styles.screen}>
      <DetailTopBar
        onBack={() => router.back()}
        subtitle={`Hinzugefügt am ${formatDetailDate(document.created_at)}`}
        title={editing ? (editable ? "Angaben prüfen" : "Angaben") : kind.label}
        trailing={
          editing ? undefined : (
            <IconButton
              accessibilityLabel="Weitere Aktionen"
              icon={MoreHorizontal}
              onPress={() => menuRef.current?.present()}
              tone="plain"
            />
          )
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (editing ? spacing.lg : 96) + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={contentEntering()}
          key={editing ? "document-editor" : "document-overview"}
          style={styles.contentState}
        >
        {!editing ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <IconTile size={52} tint={kind.tint}>
                  <KindIcon color={kind.ink} size={26} strokeWidth={1.8} />
                </IconTile>
                {editable ? (
                  <View style={styles.newPill}>
                    <Text style={styles.newPillText}>Neu gelesen</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.heroTitle}>{document.title}</Text>
              {document.summary ? (
                <Pressable
                  accessibilityRole={summaryLong ? "button" : undefined}
                  disabled={!summaryLong}
                  onPress={() => setSummaryExpanded((current) => !current)}
                >
                  <Text
                    numberOfLines={summaryExpanded ? undefined : 4}
                    style={styles.heroSummary}
                  >
                    {document.summary}
                  </Text>
                  {summaryLong ? (
                    <Text style={styles.heroMore}>
                      {summaryExpanded ? "Weniger" : "Mehr lesen"}
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}
              {people.length > 0 ? (
                <View style={styles.peopleRow}>
                  <Text style={styles.peopleLabel}>Betrifft</Text>
                  {people.map((person) => (
                    <PersonChip key={`${person.id ?? person.name}`} person={person} />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <SectionHeader
                count={consequences.length || undefined}
                title="Was das bedeutet"
              />
              {consequences.length > 0 ? (
                <ListGroup>
                  {consequences.map((entry, index) => (
                    <ConsequenceRow
                      calendarOffered={entry.kind === "date" && calendarEligible.has(entry.index)}
                      calendarSelected={entry.kind === "date" && calendarDates.has(entry.index)}
                      editable={editable}
                      entry={entry}
                      first={index === 0}
                      key={`${entry.kind}-${entry.index}`}
                      onToggleCalendar={() => toggleCalendarDate(entry.index)}
                    />
                  ))}
                </ListGroup>
              ) : (
                <View style={styles.quietCard}>
                  <Text style={styles.quietText}>
                    Keine Termine, Aufgaben oder Beträge erkannt. Das Dokument ist
                    einfach gut aufgehoben.
                  </Text>
                </View>
              )}
              {editable && consequences.some((entry) => entry.kind === "date") ? (
                <Text style={styles.calendarHint}>
                  Angehakte Termine legt Ordilo beim Bestätigen in euren Kalender.
                </Text>
              ) : null}
              {document.needs_user_review && editable ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEditing(true)}
                  style={({ pressed }) => [styles.reviewNotice, pressed && styles.pressed]}
                >
                  <View style={styles.reviewNoticeIcon}>
                    <AlertCircle color={colors.warmApricot} size={18} strokeWidth={2} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.reviewNoticeTitle}>Ein paar Angaben sind unsicher</Text>
                    <Text style={styles.reviewNoticeText}>Kurz prüfen, dann stimmt alles.</Text>
                  </View>
                  <Pencil color={colors.harborBlue} size={18} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            {isReadOnly && document.document_type === "credentials" ? (
              <CredentialsSection
                documentId={id}
                credentialText={document.credential_text}
              />
            ) : null}

            <View style={styles.section}>
              <SectionHeader title="Datei" />
              {thumbnailUrl ? (
                <Pressable
                  accessibilityHint="Öffnet das Original in groß"
                  accessibilityLabel="Original ansehen"
                  accessibilityRole="imagebutton"
                  onPress={() => setImageUrl(thumbnailUrl)}
                  style={({ pressed }) => [styles.thumbnail, pressed && styles.pressed]}
                >
                  <Image
                    accessibilityIgnoresInvertColors
                    resizeMode="cover"
                    source={{ uri: thumbnailUrl }}
                    style={styles.thumbnailImage}
                  />
                </Pressable>
              ) : null}
              <ListGroup>
                <ListRow
                  accessibilityHint="Öffnet das gespeicherte Original."
                  chevron
                  first
                  leading={
                    <IconTile>
                      {openingOriginal ? (
                        <ActivityIndicator color={colors.harborBlue} size="small" />
                      ) : (
                        <Eye color={colors.mistDark} size={20} strokeWidth={1.9} />
                      )}
                    </IconTile>
                  }
                  onPress={() => void viewOriginal()}
                  subtitle={document.original_filename ?? "Gespeicherte Datei"}
                  title={openingOriginal ? "Wird geöffnet …" : "Original ansehen"}
                />
                <ListRow
                  leading={
                    <IconTile>
                      <FileText color={colors.mistDark} size={20} strokeWidth={1.9} />
                    </IconTile>
                  }
                  onPress={() => setShowDocumentDetails((current) => !current)}
                  subtitle={[
                    document.mime_type?.replace(/^application\//, "").toUpperCase(),
                    document.page_count ? `${document.page_count} ${document.page_count === 1 ? "Seite" : "Seiten"}` : null,
                    document.suggested_category || documentTypeLabels[document.document_type],
                  ].filter(Boolean).join(" · ")}
                  title="Details"
                  trailing={
                    showDocumentDetails ? (
                      <ChevronUp color={colors.mist} size={18} />
                    ) : (
                      <ChevronDown color={colors.mist} size={18} />
                    )
                  }
                />
                {showDocumentDetails ? <DocumentMetadata document={document} /> : null}
              </ListGroup>
            </View>

            {editable ? (
              <View style={styles.aiNotice}>
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={styles.aiIcon}
                >
                  <OrdiloMark size={28} />
                </View>
                <Text style={styles.aiNoticeText}>
                  Ordilo hat das Wichtigste herausgesucht. Wenn etwas nicht
                  stimmt, tippe auf „Ändern“.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.editIntro}>
              <Text style={styles.editHelp}>
                {editable
                  ? "Ändere nur, was nicht stimmt. Danach speicherst du das Dokument mit „Passt so“."
                  : "So hat Ordilo das Dokument gelesen."}
              </Text>
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
            <DatesSection analysis={document} editable={editable} onChange={updateAnalysis} onRemoveDate={removeDateAt} />
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

            <View style={styles.actions}>
              {isReadOnly ? (
                <OrdiloButton title="Zurück zum Dokument" size="lg" onPress={() => setEditing(false)} variant="outline" />
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
          {editable ? (
            <>
              <View style={styles.bottomSecondary}>
                <OrdiloButton
                  icon={<Pencil color={colors.graphite} size={17} strokeWidth={2} />}
                  onPress={() => setEditing(true)}
                  size="lg"
                  title="Ändern"
                  variant="outline"
                />
              </View>
              <View style={styles.bottomPrimary}>
                <OrdiloButton
                  disabled={saving}
                  icon={saving ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Check color={colors.warmWhite} size={19} strokeWidth={2.4} />}
                  onPress={() => void confirm()}
                  size="lg"
                  title={saving ? "Wird gespeichert …" : "Passt so"}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.bottomSecondary}>
                <OrdiloButton
                  icon={<Eye color={colors.graphite} size={17} strokeWidth={2} />}
                  onPress={() => void viewOriginal()}
                  size="lg"
                  title="Original"
                  variant="outline"
                />
              </View>
              <View style={styles.bottomPrimary}>
                <OrdiloButton
                  icon={<OrdiloMark size={20} />}
                  onPress={() => {
                    tap();
                    router.push({
                      pathname: "/suche",
                      params: { q: `Was steht in „${document.title}“?` },
                    });
                  }}
                  size="lg"
                  title="Ordilo fragen"
                  variant="outline"
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      <CreateChoiceSheet
        accessibilityLabel="Aktionen für dieses Dokument"
        items={[
          {
            accessibilityLabel: "Original ansehen",
            description: document.original_filename ?? "Die gespeicherte Datei öffnen",
            icon: Eye,
            label: "Original ansehen",
            onPress: () => chooseMenu("original"),
            tint: "blue",
          },
          {
            accessibilityLabel: editable ? "Angaben ändern" : "Angaben ansehen",
            description: editable
              ? "Namen, Termine, Beträge korrigieren"
              : "Alles, was Ordilo gelesen hat",
            icon: Pencil,
            label: editable ? "Angaben ändern" : "Angaben ansehen",
            onPress: () => chooseMenu("edit"),
            tint: "sage",
          },
          {
            accessibilityLabel: "Dokument löschen",
            description: "Aus der Ablage entfernen",
            icon: Trash2,
            label: "Löschen",
            onPress: () => chooseMenu("delete"),
            tint: "sand",
          },
        ]}
        onDismiss={finishMenu}
        ref={menuRef}
        subtitle={document.title}
        title="Dokument"
      />

      {deleteDialog}

      <OriginalImagePreview imageUrl={imageUrl} onClose={() => setImageUrl(null)} />
    </Screen>
  );
}

/**
 * One line of meaning. Dates carry the calendar toggle while the document
 * is still being confirmed; numbers can be copied; everything else just
 * reads.
 */
function ConsequenceRow({
  calendarOffered,
  calendarSelected,
  editable,
  entry,
  first,
  onToggleCalendar,
}: {
  calendarOffered: boolean;
  calendarSelected: boolean;
  editable: boolean;
  entry: DocumentConsequence;
  first: boolean;
  onToggleCalendar: () => void;
}) {
  if (entry.kind === "date") {
    return (
      <ListRow
        first={first}
        leading={
          <IconTile tint={colors.washBlue}>
            <CalendarDays color={colors.harborBlue} size={20} strokeWidth={1.9} />
          </IconTile>
        }
        subtitle={[entry.dateLabel, entry.relative].filter(Boolean).join(" · ")}
        title={entry.label}
        titleLines={2}
        trailing={
          editable && calendarOffered ? (
            <Pressable
              accessibilityLabel={
                calendarSelected
                  ? `${entry.label} nicht in den Kalender legen`
                  : `${entry.label} in den Kalender legen`
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: calendarSelected }}
              hitSlop={8}
              onPress={onToggleCalendar}
              style={[styles.calendarToggle, calendarSelected && styles.calendarToggleOn]}
            >
              {calendarSelected ? (
                <Check color={colors.warmWhite} size={14} strokeWidth={3} />
              ) : (
                <CalendarPlus color={colors.harborBlue} size={14} strokeWidth={2.2} />
              )}
              <Text style={[styles.calendarToggleText, calendarSelected && styles.calendarToggleTextOn]}>
                Kalender
              </Text>
            </Pressable>
          ) : undefined
        }
      />
    );
  }
  if (entry.kind === "task") {
    return (
      <ListRow
        first={first}
        leading={
          <IconTile tint={colors.washSage}>
            <ListChecks color="#2F6B52" size={20} strokeWidth={1.9} />
          </IconTile>
        }
        subtitle={entry.dueLabel ? `Bis ${entry.dueLabel}` : "Ohne Frist"}
        title={entry.title}
        titleLines={2}
      />
    );
  }
  if (entry.kind === "amount") {
    return (
      <ListRow
        first={first}
        leading={
          <IconTile tint={colors.washApricot}>
            <Wallet color="#9A4A12" size={20} strokeWidth={1.9} />
          </IconTile>
        }
        subtitle={entry.date ? `Zum ${formatDetailDate(`${entry.date}T12:00:00`)}` : null}
        title={entry.label}
        trailing={<Text style={styles.amountValue}>{entry.value}</Text>}
      />
    );
  }
  return (
    <ListRow
      first={first}
      leading={
        <IconTile>
          <Hash color={colors.mistDark} size={20} strokeWidth={1.9} />
        </IconTile>
      }
      subtitle={entry.value}
      title={entry.label}
      trailing={<CopyButton label={entry.label} value={entry.value} />}
    />
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <Pressable
      accessibilityLabel={`${label} kopieren`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={async () => {
        const ok = await Clipboard.setStringAsync(value);
        if (!ok) return;
        select();
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1_500);
      }}
      style={styles.iconButton}
    >
      {copied ? (
        <Check color={colors.harborBlue} size={18} />
      ) : (
        <Copy color={colors.harborBlue} size={18} strokeWidth={1.9} />
      )}
    </Pressable>
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
        heading={failed ? "Das hat nicht geklappt" : processing ? "Ordilo liest noch" : "Noch nicht bereit"}
        description={failed
          ? "Ordilo konnte dieses Dokument nicht lesen. Du kannst es später noch einmal scannen."
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
    <View style={styles.metadata}>
      {rows.map((row) => (
        <View key={row.label} style={styles.metadataRow}>
          <Text style={styles.metadataLabel}>{row.label}</Text>
          <Text numberOfLines={2} style={styles.metadataValue}>{row.value}</Text>
        </View>
      ))}
    </View>
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
    <View style={styles.section}>
      <SectionHeader title="Zugangsdaten" />
      <Card style={styles.card}>
        <View style={styles.sectionTitle}>
          <KeyRound color={colors.mistDark} size={18} />
          <Text style={styles.sectionHeading}>Nur für euch sichtbar</Text>
        </View>
        {fields.url ? <CredentialValue label="URL" value={fields.url} /> : null}
        {fields.username ? <CredentialValue label="Benutzername" value={fields.username} /> : null}
        <SecretReveal documentId={documentId} />
      </Card>
    </View>
  );
}

function CredentialValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copy = async () => {
    const ok = await Clipboard.setStringAsync(value);
    if (!ok) return;
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
    const ok = await Clipboard.setStringAsync(secret);
    if (!ok) return;
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
    day: "numeric",
    month: "long",
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

function DatesSection({
  analysis,
  editable,
  onChange,
  onRemoveDate,
}: SectionProps & { onRemoveDate: (index: number) => void }) {
  return (
    <Section icon={CalendarDays} title="Termine" onAdd={editable ? () => onChange((current) => ({ ...current, dates: [...current.dates, { date: "", label: "", type: "other", confidence: 1 }] })) : undefined}>
      {analysis.dates.length === 0 ? <EmptyRows text="Kein Termin erkannt." /> : null}
      {analysis.dates.map((date, index) => editable ? (
        <EditableRow
          key={index}
          onDelete={() => {
            // The calendar selection follows the compacted array, so a
            // removal never hands an unchecked date to the planner.
            onRemoveDate(index);
            removeAt("dates", index, onChange);
          }}
        >
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
    <Section icon={Hash} title="Nummern & Kennungen" onAdd={editable ? () => onChange((current) => ({ ...current, facts: [...current.facts, { fact_type: "identifier", label: "", value: "", confidence: 1 }] })) : undefined}>
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
  confirmedScreen: { justifyContent: "space-between", paddingHorizontal: spacing.md },
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
  confirmedEyebrow: { color: colors.harborBlue, ...typography.caption },
  confirmedHeading: {
    ...typography.heading,
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
  content: { gap: spacing.md, padding: spacing.md, paddingTop: spacing.xs },
  contentState: { gap: spacing.lg },
  hero: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroTitle: { color: colors.graphite, ...typography.heading },
  heroSummary: { color: colors.graphite, ...typography.body },
  heroMore: { color: colors.harborBlue, marginTop: spacing.xs, ...typography.caption },
  peopleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  peopleLabel: { color: colors.mistDark, ...typography.caption },
  newPill: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  newPillText: { color: colors.warmWhite, ...typography.caption },
  section: { gap: spacing.sm },
  quietCard: {
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  quietText: { color: colors.mistDark, ...typography.timestamp },
  calendarHint: {
    color: colors.mistDark,
    paddingHorizontal: spacing.xs,
    ...typography.label,
    lineHeight: 16,
  },
  calendarToggle: {
    alignItems: "center",
    borderColor: colors.harborLine,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  calendarToggleOn: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  calendarToggleText: { color: colors.harborBlue, ...typography.caption },
  calendarToggleTextOn: { color: colors.warmWhite },
  amountValue: { color: colors.graphite, ...typography.title },
  reviewNotice: {
    alignItems: "center",
    backgroundColor: colors.washApricot,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  reviewNoticeIcon: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  reviewNoticeTitle: { color: colors.graphite, ...typography.title },
  reviewNoticeText: { color: colors.mistDark, ...typography.timestamp },
  thumbnail: {
    backgroundColor: colors.sandLight,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 180,
    overflow: "hidden",
  },
  thumbnailImage: { height: "100%", width: "100%" },
  aiNotice: { alignItems: "center", backgroundColor: colors.sandLight, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  aiIcon: { alignItems: "center", backgroundColor: colors.warmWhite, borderRadius: radii.pill, height: 36, justifyContent: "center", width: 36 },
  aiNoticeText: { color: colors.graphite, flex: 1, ...typography.timestamp },
  editIntro: { paddingHorizontal: spacing.xs },
  editHelp: { color: colors.mistDark, ...typography.timestamp },
  metadata: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: spacing.xs,
  },
  metadataRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.md, minHeight: 36, paddingVertical: spacing.xs },
  metadataLabel: { color: colors.mistDark, minWidth: 92, ...typography.label },
  metadataValue: { color: colors.graphite, flex: 1, textAlign: "right", ...typography.timestamp },
  bottomBar: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  bottomSecondary: { flex: 1 },
  bottomPrimary: { flex: 1.4 },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.65 },
  card: { gap: spacing.sm },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 28 },
  sectionTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionHeading: { color: colors.graphite, ...typography.title },
  label: { color: colors.mistDark, marginTop: spacing.xs, ...typography.label },
  input: { backgroundColor: colors.warmWhite, borderColor: colors.mistLight, borderRadius: radii.base, borderWidth: 1, color: colors.graphite, minHeight: sizes.touch, paddingHorizontal: spacing.sm, ...typography.body },
  summary: { minHeight: 88, paddingTop: spacing.sm },
  value: { color: colors.graphite, ...typography.body },
  emptyRows: { color: colors.mistDark, ...typography.timestamp },
  confidence: { color: colors.warmApricot, ...typography.label },
  editableRow: { borderTopColor: colors.mistLight, borderTopWidth: 1, flexDirection: "row", gap: spacing.xs, paddingTop: spacing.sm },
  rowContent: { flex: 1, gap: spacing.xs, minWidth: 0 },
  deleteButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  addButton: { alignItems: "center", flexDirection: "row", gap: 2, minHeight: 44, paddingHorizontal: spacing.xs },
  addButtonText: { color: colors.harborBlue, ...typography.label },
  addLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  addInput: { flex: 1 },
  smallButton: { alignItems: "center", backgroundColor: colors.harborBlue, borderRadius: radii.sm, height: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  smallButtonText: { color: colors.warmWhite, ...typography.label },
  tags: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tag: { alignItems: "center", backgroundColor: colors.harborTint, borderRadius: radii.pill, justifyContent: "center", minHeight: 36, paddingHorizontal: 12, paddingVertical: 4 },
  tagText: { color: colors.harborBlue, ...typography.caption },
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
