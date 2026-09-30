import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowDownAZ,
  BookOpen,
  ChevronDown,
  FilePlus2,
  FileText,
  KeyRound,
  NotebookPen,
  Plus,
  ScanLine,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { AmbientFields } from "@/src/components/ambient-fields";
import { CreateChoiceSheet } from "@/src/components/create-choice-sheet";
import {
  ContactAvatar,
  ContactFormSheet,
} from "@/src/components/contacts";
import { NoteFormSheet } from "@/src/components/note-form-sheet";
import { MOBILE_DOCK_CONTENT_INSET } from "@/src/components/ordilo-tab-bar";
import { AvatarStack, PersonAvatar } from "@/src/components/person";
import {
  OrdiloPickerOverlay,
  OrdiloPickerSheet,
} from "@/src/components/picker-sheet";
import {
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormSelect,
  OrdiloFormSheet,
  type OrdiloSheetHandle,
} from "@/src/components/sheet";
import {
  Chip,
  EmptyState,
  IconTile,
  InlineNotice,
  ListGroup,
  ListRow,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
} from "@/src/components/ui";
import { getDocumentKind } from "@/src/lib/document-kind";
import {
  documentTypeLabels,
  type DocumentType,
} from "@/src/lib/document-review";
import {
  filterContacts,
  getContactReachLine,
  getContactSubtitle,
  groupContactsIntoSections,
  loadContacts,
  loadContactSourceTitles,
  mergeSavedContact,
  splitContactsByStatus,
  type Contact,
} from "@/src/lib/contacts";
import { useFamily } from "@/src/lib/family-context";
import { createNote, triggerNoteAnalysis } from "@/src/lib/notes";
import {
  buildLibraryFilterExpression,
  filterLibraryDocuments,
  formatLibraryCount,
  getLibraryEntryGroup,
  isNearListEnd,
  libraryKindOptions,
  type LibraryKind,
  formatDocumentDate,
  getDocumentStatusLabel,
  getDocumentStatusGroup,
  getDocumentStatusTone,
  getDocumentTitle,
  getLibraryPageRange,
  getLibrarySortOrder,
  groupLibraryDocuments,
  isManualNote,
  libraryDocumentSelect,
  libraryPageSize,
  librarySortOptions,
  libraryStatusFilters,
  loadLibraryDocumentIdsForPerson,
  loadLibraryDocumentPeople,
  mergeLibraryDocuments,
  subscribeToLibraryChanges,
  type LibraryDocument,
  type LibraryFilters,
  type LibrarySort,
} from "@/src/lib/library";
import { formatPeopleLine, type Person } from "@/src/lib/people";
import { getSupabase } from "@/src/lib/supabase";
import { fetchFamilyMembers, type FamilyMemberOption } from "@/src/lib/tasks";
import {
  contentEntering,
  listLayout,
  stateEntering,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { getManualNotePreview } from "@ordilo/document-contract";

const documentTypes = Object.entries(documentTypeLabels) as [
  DocumentType,
  string,
][];
type CreateKind = "document" | "note" | "contact";
const DOCUMENT_ROW_LAYOUT = listLayout();

const KIND_ICON: Record<LibraryKind, LucideIcon | undefined> = {
  all: undefined,
  documents: FileText,
  notes: NotebookPen,
  credentials: KeyRound,
  contacts: Users,
};

const SEARCH_PLACEHOLDER: Record<LibraryKind, string> = {
  all: "Alles durchsuchen",
  documents: "Titel, Inhalt oder Absender",
  notes: "Notizen durchsuchen",
  credentials: "Zugänge durchsuchen",
  contacts: "Name oder Organisation",
};

const EMPTY_SUBTITLE: Record<LibraryKind, string> = {
  all: "Alles, was ihr aufbewahrt",
  documents: "Alles, was Ordilo für euch gelesen hat",
  notes: "Familienwissen, das nirgends auf Papier steht",
  credentials: "Passwörter und Logins, sicher verwahrt",
  contacts: "Wichtige Menschen aus euren Unterlagen",
};

const NO_FILTERS: LibraryFilters = {
  query: "",
  status: "all",
  documentType: "all",
  personId: "all",
};

/**
 * Dokumente — the family's filing place, as one list. Chips narrow it by
 * what a thing is (Dokument, Notiz, Zugang, Kontakt) instead of splitting
 * it by how it got in, and the one search always looks everywhere. Rows
 * say what they are (kind icon and label), whom they concern (faces) and,
 * only while Ordilo still needs something, their state. Date-sorted lists
 * are grouped by week and month, and the next page loads while scrolling.
 */
export default function AblageScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [people, setPeople] = useState<Map<string, Person[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [createNoteType, setCreateNoteType] = useState<DocumentType | null>(null);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSources, setContactSources] = useState<Map<string, string>>(new Map());
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsRefreshing, setContactsRefreshing] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [view, setView] = useState<LibraryKind>("all");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [resultsRevision, setResultsRevision] = useState(0);
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  const [draftFilters, setDraftFilters] = useState<
    Pick<LibraryFilters, "status" | "documentType" | "personId">
  >({
    status: "all",
    documentType: "all",
    personId: "all",
  });
  const requestGeneration = useRef(0);
  const createSheetRef = useRef<OrdiloSheetHandle>(null);
  const pendingCreateRef = useRef<CreateKind | null>(null);
  const membersRef = useRef<FamilyMemberOption[]>([]);

  useEffect(() => {
    if (!family) return;
    let cancelled = false;
    void fetchFamilyMembers(family.id)
      .then((rows) => {
        if (cancelled) return;
        membersRef.current = rows;
        setMembers(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [family]);

  const loadDocuments = useCallback(
    async ({ append = false, page = 0, refresh = false } = {}) => {
      if (view === "contacts") {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }
      const requestId = requestGeneration.current + 1;
      requestGeneration.current = requestId;
      const isCurrentRequest = () => requestGeneration.current === requestId;
      if (!family) {
        if (isCurrentRequest()) {
          setDocuments([]);
          setHasMore(false);
          setTotalCount(null);
          setLoading(false);
        }
        return;
      }
      if (refresh) setRefreshing(true);
      else if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const range = getLibraryPageRange(page);
        const order = getLibrarySortOrder(sort);
        const personDocumentIds =
          filters.personId === "all"
            ? null
            : await loadLibraryDocumentIdsForPerson(
                family.id,
                filters.personId,
              );
        if (personDocumentIds?.length === 0) {
          if (isCurrentRequest()) {
            setDocuments([]);
            setPeople(new Map());
            setHasMore(false);
            setTotalCount(0);
            setNextPage(page);
            if (!append && !filters.query.trim()) {
              setResultsRevision((current) => current + 1);
            }
          }
          return;
        }
        // The explicit family predicate narrows the library to the resolved
        // family; RLS remains the authority for this anon-key client. Only
        // the first page asks for the total, so the header can say how
        // much there is without every scroll step counting again.
        let query = getSupabase()
          .from("documents")
          .select(
            libraryDocumentSelect,
            page === 0 && !append ? { count: "exact" } : undefined,
          )
          .eq("family_id", family.id);
        // Notes are documents with source "manual". Zugänge are credentials
        // from either source, so the other two kinds leave them out.
        if (view === "notes") query = query.eq("source", "manual");
        if (view === "documents") query = query.neq("source", "manual");
        if (view === "credentials") query = query.eq("document_type", "credentials");
        if (filters.status === "needs_review") query = query.eq("status", "analyzed");
        if (filters.status === "confirmed") query = query.eq("status", "confirmed");
        if (filters.status === "failed") query = query.eq("status", "failed");
        if (filters.status === "processing") {
          query = query.in("status", ["uploaded", "ocr_processing", "ocr_done", "analyzing"]);
        }
        if (filters.documentType !== "all") {
          query = query.eq("document_type", filters.documentType);
        }
        if (personDocumentIds) {
          query = query.in("id", personDocumentIds);
        }
        const expression = buildLibraryFilterExpression(view, filters.query);
        if (expression) query = query.or(expression);
        const { count, data, error: queryError } = await query
          .order(order.column, { ascending: order.ascending })
          .range(range.from, range.to);
        if (queryError) throw queryError;
        const next = (data ?? []) as LibraryDocument[];
        if (isCurrentRequest()) {
          setDocuments((current) =>
            append ? mergeLibraryDocuments(current, next) : next,
          );
          if (!append) setTotalCount(typeof count === "number" ? count : null);
          setHasMore(next.length === libraryPageSize);
          setNextPage(next.length === libraryPageSize ? page + 1 : page);
          // Filter and sort commits cross-fade the result once the requested
          // data arrives. Typing in search stays instant so every keystroke
          // does not replay an entrance.
          if (!append && !filters.query.trim()) {
            setResultsRevision((current) => current + 1);
          }
        }
        const paperIds = next
          .filter((document) => !isManualNote(document))
          .map((document) => document.id);
        if (paperIds.length > 0) {
          // People arrive a beat after the rows; the list never waits for them.
          const pagePeople = await loadLibraryDocumentPeople(
            paperIds,
            membersRef.current,
          );
          if (isCurrentRequest()) {
            setPeople((current) => {
              const merged = append ? new Map(current) : new Map<string, Person[]>();
              for (const [id, list] of pagePeople) merged.set(id, list);
              return merged;
            });
          }
        }
      } catch {
        if (isCurrentRequest()) {
          setError(
            "Deine Dokumente konnten nicht geladen werden. Bitte versuch es nochmal.",
          );
        }
      } finally {
        if (isCurrentRequest()) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [family, filters, sort, view],
  );

  useFocusEffect(useCallback(() => {
    void loadDocuments();
  }, [loadDocuments]));

  useEffect(() => subscribeToLibraryChanges((change) => {
    if (view === "contacts") return;
    if (change.type === "remove") {
      setDocuments((current) => current.filter((document) => document.id !== change.documentId));
      setTotalCount((current) => (current === null ? null : Math.max(0, current - 1)));
      return;
    }
    void loadDocuments({ refresh: true });
  }), [loadDocuments, view]);

  const loadContactRows = useCallback(async ({ refresh = false } = {}) => {
    if (!family) {
      setContacts([]);
      setContactsLoading(false);
      return;
    }
    if (refresh) setContactsRefreshing(true);
    else setContactsLoading(true);
    setContactsError(null);
    try {
      const rows = await loadContacts(family.id);
      setContacts(rows);
      const sourceIds = rows
        .map((contact) => contact.source_document_id)
        .filter((id): id is string => Boolean(id));
      void loadContactSourceTitles(sourceIds)
        .then(setContactSources)
        .catch(() => undefined);
    } catch {
      setContactsError(
        "Deine Kontakte konnten nicht geladen werden. Bitte versuch es nochmal.",
      );
    } finally {
      setContactsLoading(false);
      setContactsRefreshing(false);
    }
  }, [family]);

  // Contacts load with every visit, not only on their chip: the search
  // in "Alle" finds them too, and new ones found in letters are announced.
  useFocusEffect(useCallback(() => {
    void loadContactRows();
  }, [loadContactRows]));

  const reloadDocuments = useCallback(() => {
    void loadDocuments({ refresh: true });
  }, [loadDocuments]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void loadDocuments({ append: true, page: nextPage });
  }, [hasMore, loadDocuments, loading, loadingMore, nextPage]);

  const chooseCreateKind = useCallback((kind: CreateKind) => {
    pendingCreateRef.current = kind;
    createSheetRef.current?.dismiss();
  }, []);

  const finishCreateChoice = useCallback(() => {
    const kind = pendingCreateRef.current;
    pendingCreateRef.current = null;
    // „Scannen, fotografieren oder eine Datei wählen“ — so the chooser, not
    // straight into the camera.
    if (kind === "document") router.push("/scan");
    if (kind === "note") setCreateNoteType(view === "credentials" ? "credentials" : "note");
    if (kind === "contact") setCreateContactOpen(true);
  }, [router, view]);

  const chooseSort = useCallback((nextSort: LibrarySort) => {
    setSort(nextSort);
    setSortPickerOpen(false);
  }, []);

  const openFilterSheet = useCallback(() => {
    setDraftFilters({
      status: filters.status,
      documentType: filters.documentType,
      personId: filters.personId,
    });
    setFilterSheetOpen(true);
  }, [filters.documentType, filters.personId, filters.status]);

  const applyFilters = useCallback(() => {
    setFilters((current) => ({
      ...current,
      status: draftFilters.status,
      documentType: draftFilters.documentType,
      personId: draftFilters.personId,
    }));
    setFilterSheetOpen(false);
  }, [draftFilters]);

  const sortedLabel = useMemo(
    () => librarySortOptions.find((option) => option.value === sort)?.label ?? "Neueste zuerst",
    [sort],
  );
  const compactSortLabel =
    sort === "oldest" ? "Älteste" : sort === "title" ? "Name" : "Neueste";

  const { suggested: suggestedContacts, confirmed: confirmedContacts } = useMemo(
    () => splitContactsByStatus(contacts),
    [contacts],
  );
  const searching = filters.query.trim() !== "";
  const activeFilterCount =
    Number(filters.status !== "all") +
    Number(filters.documentType !== "all") +
    Number(filters.personId !== "all");
  const hasActiveFilters = searching || activeFilterCount > 0;

  const subtitle = useMemo(() => {
    if (view === "contacts") {
      if (contactsLoading && contacts.length === 0) return "Kontakte werden geladen";
      if (searching) {
        return formatLibraryCount("contacts", filterContacts(contacts, filters.query).length, { filtered: true });
      }
      if (confirmedContacts.length === 0) return EMPTY_SUBTITLE.contacts;
      return formatLibraryCount("contacts", confirmedContacts.length);
    }
    if (loading && documents.length === 0) return "Wird geladen";
    if (documents.length === 0 && !hasActiveFilters) return EMPTY_SUBTITLE[view];
    return formatLibraryCount(view, totalCount ?? documents.length, {
      filtered: hasActiveFilters,
      more: totalCount === null && hasMore,
    });
  }, [
    confirmedContacts.length,
    contacts,
    contactsLoading,
    documents.length,
    filters.query,
    hasActiveFilters,
    hasMore,
    loading,
    searching,
    totalCount,
    view,
  ]);

  const visibleDocuments = useMemo(
    () => filterLibraryDocuments(documents, filters),
    [documents, filters],
  );
  const groups = useMemo(
    () => groupLibraryDocuments(visibleDocuments, sort),
    [visibleDocuments, sort],
  );
  const matchingContacts = useMemo(
    () => (view === "all" && searching ? filterContacts(contacts, filters.query) : []),
    [contacts, filters.query, searching, view],
  );
  const hiddenFilterCount =
    Number(
      filters.status !== "all" && filters.status !== "needs_review",
    ) +
    Number(filters.documentType !== "all") +
    Number(filters.personId !== "all");
  const visibleReviewCount =
    filters.status === "all" || filters.status === "needs_review"
      ? documents.filter(
          (document) =>
            getDocumentStatusGroup(document.status) === "needs_review",
        ).length
      : 0;
  const reviewFilterLabel =
    visibleReviewCount > 0
      ? `Zu prüfen ${visibleReviewCount}${hasMore ? "+" : ""}`
      : "Zu prüfen";

  const switchView = useCallback((nextView: LibraryKind) => {
    if (nextView === view) return;
    // Invalidate the previous query before replacing the visible list. A
    // slow "Alle" response must never populate the Notizen list. The search
    // stays: looking for the same thing under another chip is the point.
    requestGeneration.current += 1;
    if (nextView !== "contacts") {
      setDocuments([]);
      setError(null);
      setHasMore(false);
      setTotalCount(null);
      setLoading(true);
      setNextPage(1);
      setFilters((current) => ({ ...current, documentType: "all" }));
    }
    setView(nextView);
  }, [view]);

  const handleContactCreated = useCallback((saved: Contact) => {
    setContacts((current) => mergeSavedContact(current, saved));
    setCreateContactOpen(false);
    switchView("contacts");
  }, [switchView]);

  const createNewNote = useCallback(
    async (
      draft: Omit<Parameters<typeof createNote>[0], "familyId">,
    ) => {
      if (!family) {
        throw new Error("Deine Familie konnte nicht geladen werden.");
      }
      const result = await createNote({ ...draft, familyId: family.id });
      if (!result.server_pipeline) {
        void triggerNoteAnalysis(result.document_id).catch(() => undefined);
      }
      void loadDocuments({ refresh: true });
      router.push(`/note/${result.document_id}`);
    },
    [family, loadDocuments, router],
  );

  if (
    view !== "contacts" &&
    error &&
    documents.length === 0 &&
    !hasActiveFilters
  ) {
    return (
      <Screen style={styles.center}>
        <EmptyState
          icon={AlertCircle}
          heading="Dokumente nicht erreichbar"
          description={error}
        >
          <OrdiloButton
            onPress={() => void loadDocuments()}
            size="lg"
            title="Erneut versuchen"
          />
        </EmptyState>
      </Screen>
    );
  }

  const libraryEmpty =
    view !== "contacts" &&
    !loading &&
    documents.length === 0 &&
    !hasActiveFilters;
  const showSearch =
    hasActiveFilters ||
    documents.length > 0 ||
    contacts.length > 0 ||
    view !== "all";
  const showDocumentControls =
    view !== "contacts" && (documents.length > 0 || hasActiveFilters);

  return (
    <Screen>
      <AmbientFields style={styles.ambientBehind} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          if (view !== "contacts" && isNearListEnd(nativeEvent)) loadMore();
        }}
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() => {
              void loadContactRows({ refresh: true });
              if (view !== "contacts") reloadDocuments();
            }}
            refreshing={
              view === "contacts" ? contactsRefreshing : refreshing
            }
            tintColor={colors.harborBlue}
          />
        }
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          action={{
            accessibilityLabel: "Neu anlegen",
            icon: Plus,
            onPress: () => createSheetRef.current?.present(),
          }}
          subtitle={subtitle}
          title="Dokumente"
        />

        {showSearch ? (
          <SearchField
            accessibilityLabel={SEARCH_PLACEHOLDER[view]}
            onChangeText={(query) =>
              setFilters((current) => ({ ...current, query }))
            }
            placeholder={SEARCH_PLACEHOLDER[view]}
            value={filters.query}
          />
        ) : null}

        <ScrollView
          accessibilityRole="tablist"
          contentContainerStyle={styles.chips}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
        >
          {libraryKindOptions.map((option) => (
            <Chip
              accessibilityLabel={`${option.label} anzeigen`}
              icon={KIND_ICON[option.value]}
              key={option.value}
              label={
                option.value === "contacts" && suggestedContacts.length > 0
                  ? `${option.label} · ${suggestedContacts.length} neu`
                  : option.label
              }
              onPress={() => switchView(option.value)}
              selected={view === option.value}
            />
          ))}
        </ScrollView>

        <Animated.View
          entering={stateEntering()}
          key={view}
          style={styles.viewContent}
        >
        {view === "contacts" ? (
          <ContactsView
            contacts={contacts}
            error={contactsError}
            loading={contactsLoading}
            onCreate={() => setCreateContactOpen(true)}
            onOpen={(contactId) => router.push(`/contacts/${contactId}`)}
            onOpenSource={(documentId) =>
              router.push(`/document/${documentId}`)
            }
            onResetSearch={() => setFilters((current) => ({ ...current, query: "" }))}
            onRetry={() => void loadContactRows()}
            query={filters.query}
            sourceTitles={contactSources}
          />
        ) : loading && documents.length === 0 && !hasActiveFilters ? (
          <ListSkeleton rows={6} />
        ) : showDocumentControls ? (
          <>
            {view === "all" && !searching && suggestedContacts.length > 0 ? (
              <ListGroup>
                <ListRow
                  accessibilityHint="Zeigt die Kontakte, die Ordilo in euren Dokumenten gefunden hat"
                  chevron
                  first
                  leading={
                    <IconTile tint={colors.harborTint}>
                      <UserPlus color={colors.harborBlue} size={20} strokeWidth={1.9} />
                    </IconTile>
                  }
                  onPress={() => switchView("contacts")}
                  subtitle="Aus euren Dokumenten. Kurz prüfen?"
                  title={
                    suggestedContacts.length === 1
                      ? "1 neuer Kontakt gefunden"
                      : `${suggestedContacts.length} neue Kontakte gefunden`
                  }
                />
              </ListGroup>
            ) : null}

            <View style={styles.libraryToolbar}>
              {visibleReviewCount > 0 ||
              filters.status === "needs_review" ? (
                <Chip
                  accessibilityLabel={
                    visibleReviewCount > 0
                      ? `${visibleReviewCount}${hasMore ? " oder mehr" : ""} Dokumente zu prüfen`
                      : "Dokumente zu prüfen"
                  }
                  label={reviewFilterLabel}
                  onPress={() =>
                    setFilters((current) => ({
                      ...current,
                      status:
                        current.status === "needs_review"
                          ? "all"
                          : "needs_review",
                    }))
                  }
                  selected={filters.status === "needs_review"}
                  tone="attention"
                />
              ) : null}
              <Chip
                accessibilityLabel={
                  hiddenFilterCount > 0
                    ? `${hiddenFilterCount} weitere Filter aktiv`
                    : "Dokumente filtern"
                }
                icon={SlidersHorizontal}
                label={
                  hiddenFilterCount > 0
                    ? `Filter ${hiddenFilterCount}`
                    : "Filter"
                }
                onPress={openFilterSheet}
                selected={hiddenFilterCount > 0}
              />
              <View style={styles.sortControl}>
                <Chip
                  accessibilityLabel={`Sortierung: ${sortedLabel}`}
                  icon={ArrowDownAZ}
                  label={compactSortLabel}
                  onPress={() => setSortPickerOpen(true)}
                />
              </View>
            </View>

            <Animated.View
              entering={contentEntering()}
              key={resultsRevision}
              style={styles.resultsContent}
            >
            {error ? (
              <InlineNotice
                actionLabel="Erneut versuchen"
                message={error}
                onAction={() => void loadDocuments({ refresh: documents.length > 0 })}
              />
            ) : null}

            {matchingContacts.length > 0 ? (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>Kontakte</Text>
                <ListGroup>
                  {matchingContacts.slice(0, 3).map((contact, index) => (
                    <ContactRow
                      contact={contact}
                      first={index === 0}
                      key={contact.id}
                      onPress={() =>
                        contact.status === "suggested" && contact.source_document_id
                          ? router.push(`/document/${contact.source_document_id}`)
                          : router.push(`/contacts/${contact.id}`)
                      }
                      review={contact.status === "suggested"}
                      sourceTitle={contact.source_document_id ? contactSources.get(contact.source_document_id) : undefined}
                    />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {loading && documents.length === 0 ? (
              <ActivityIndicator
                accessibilityLabel="Dokumente werden geladen"
                color={colors.harborBlue}
                style={styles.filteredLoading}
              />
            ) : visibleDocuments.length > 0 ? (
              <>
                {groups.map((group) => (
                  <View key={group.key} style={styles.group}>
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    <ListGroup>
                      {group.documents.map((document, index) => (
                          <Animated.View
                            key={document.id}
                            layout={DOCUMENT_ROW_LAYOUT}
                          >
                            <DocumentRow
                              document={document}
                              first={index === 0}
                              onPress={() =>
                                router.push(
                                  isManualNote(document)
                                    ? `/note/${document.id}`
                                    : `/document/${document.id}`,
                                )
                              }
                              people={people.get(document.id) ?? []}
                            />
                          </Animated.View>
                      ))}
                    </ListGroup>
                  </View>
                ))}
                {hasMore ? (
                  <View style={styles.listEnd}>
                    {loadingMore ? (
                      <ActivityIndicator
                        accessibilityLabel="Weitere werden geladen"
                        color={colors.harborBlue}
                      />
                    ) : (
                      <OrdiloButton
                        onPress={loadMore}
                        title="Weitere laden"
                        variant="ghost"
                      />
                    )}
                  </View>
                ) : visibleDocuments.length > libraryPageSize ? (
                  <Text style={styles.listEndText}>Das ist alles.</Text>
                ) : null}
              </>
            ) : matchingContacts.length > 0 ? null : (
              <FilteredEmptyState
                activeFilterCount={activeFilterCount}
                query={filters.query}
                onLoadMore={hasMore ? loadMore : undefined}
                onReset={() => setFilters(NO_FILTERS)}
              />
            )}
            </Animated.View>
          </>
        ) : libraryEmpty && view === "notes" ? (
          <EmptyState
            icon={NotebookPen}
            heading="Noch keine Notizen"
            description="Schuhgröße, die Nummer vom Hausmeister, wer wann den Müll rausbringt: Dinge, die nirgends auf Papier stehen."
          >
            <OrdiloButton onPress={() => setCreateNoteType("note")} size="lg" title="Erste Notiz anlegen" />
          </EmptyState>
        ) : libraryEmpty && view === "credentials" ? (
          <EmptyState
            icon={KeyRound}
            heading="Noch keine Zugänge"
            description="WLAN, Streaming, Kundenkonto: Leg Logins hier ab. Das Passwort bleibt verdeckt, bis du es brauchst."
          >
            <OrdiloButton onPress={() => setCreateNoteType("credentials")} size="lg" title="Zugang anlegen" />
          </EmptyState>
        ) : (
          <EmptyState
            icon={BookOpen}
            heading={view === "all" ? "Noch nichts abgelegt" : "Noch keine Dokumente"}
            description="Scanne den ersten Brief. Ordilo liest ihn und legt ihn hier ab, mit allem, was drinsteht."
          >
            <OrdiloButton
              icon={<ScanLine color={colors.warmWhite} size={18} />}
              onPress={() => router.push({ pathname: "/scan", params: { auto: "1" } })}
              size="lg"
              title="Dokument scannen"
            />
          </EmptyState>
        )}
        </Animated.View>
      </ScrollView>

      <LibraryFilterSheet
        documentType={draftFilters.documentType}
        members={members}
        onApply={applyFilters}
        onClose={() => setFilterSheetOpen(false)}
        onDocumentTypeChange={(documentType) =>
          setDraftFilters((current) => ({ ...current, documentType }))
        }
        onReset={() =>
          setDraftFilters({
            status: "all",
            documentType: "all",
            personId: "all",
          })
        }
        onPersonChange={(personId) =>
          setDraftFilters((current) => ({ ...current, personId }))
        }
        onStatusChange={(status) =>
          setDraftFilters((current) => ({ ...current, status }))
        }
        status={draftFilters.status}
        personId={draftFilters.personId}
        visible={filterSheetOpen}
      />
      <SortPicker
        onClose={() => setSortPickerOpen(false)}
        onSelect={chooseSort}
        selected={sort}
        visible={sortPickerOpen}
      />
      <CreateChoiceSheet
        accessibilityLabel="Neu anlegen"
        items={[
          {
            accessibilityLabel: "Neues Dokument",
            description: "Scannen, fotografieren oder eine Datei wählen",
            icon: FilePlus2,
            label: "Dokument",
            onPress: () => chooseCreateKind("document"),
            tint: "sage",
          },
          {
            accessibilityLabel: "Neue Notiz",
            description: "Aufschreiben, was nirgends auf Papier steht, auch Zugänge",
            icon: NotebookPen,
            label: "Notiz oder Zugang",
            onPress: () => chooseCreateKind("note"),
            tint: "apricot",
          },
          {
            accessibilityLabel: "Neuer Kontakt",
            description: "Adressen und wichtige Personen",
            icon: UserPlus,
            label: "Kontakt",
            onPress: () => chooseCreateKind("contact"),
            tint: "sand",
          },
        ]}
        onDismiss={finishCreateChoice}
        ref={createSheetRef}
      />
      <NoteFormSheet
        initialType={createNoteType ?? "note"}
        onClose={() => setCreateNoteType(null)}
        onSubmit={createNewNote}
        visible={createNoteType !== null}
      />
      <ContactFormSheet
        contact={null}
        familyId={family?.id ?? null}
        onClose={() => setCreateContactOpen(false)}
        onSaved={handleContactCreated}
        visible={createContactOpen}
      />
    </Screen>
  );
}

/** The one search field of the library: quiet, 44pt, clears in one tap. */
function SearchField({
  accessibilityLabel,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.search}>
      <Search color={colors.mistDark} size={18} strokeWidth={2} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        maxFontSizeMultiplier={1.3}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mistDark}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Suche löschen"
          accessibilityRole="button"
          hitSlop={11}
          onPress={() => onChangeText("")}
          style={styles.searchClear}
        >
          <X color={colors.mistDark} size={14} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ContactsView({
  contacts,
  error,
  loading,
  onCreate,
  onOpen,
  onOpenSource,
  onResetSearch,
  onRetry,
  query,
  sourceTitles,
}: {
  contacts: Contact[];
  error: string | null;
  loading: boolean;
  onCreate: () => void;
  onOpen: (contactId: string) => void;
  onOpenSource: (documentId: string) => void;
  onResetSearch: () => void;
  onRetry: () => void;
  query: string;
  sourceTitles: Map<string, string>;
}) {
  const { suggested, confirmed } = useMemo(
    () => splitContactsByStatus(contacts),
    [contacts],
  );
  const sections = useMemo(
    () => groupContactsIntoSections(filterContacts(confirmed, query)),
    [confirmed, query],
  );
  const searching = Boolean(query.trim());
  const sourceOf = (contact: Contact) =>
    contact.source_document_id ? sourceTitles.get(contact.source_document_id) : undefined;

  if (loading && contacts.length === 0) {
    return <ListSkeleton rows={5} />;
  }

  if (error && contacts.length === 0) {
    return (
      <EmptyState
        description={error}
        heading="Kontakte nicht erreichbar"
        icon={AlertCircle}
      >
        <OrdiloButton
          onPress={onRetry}
          size="lg"
          title="Erneut versuchen"
        />
      </EmptyState>
    );
  }

  if (contacts.length === 0) {
    return (
      <EmptyState
        description="Kinderarzt, Schule, Vermieter: Ordilo merkt sich Kontakte aus euren Briefen. Du kannst sie auch selbst anlegen."
        heading="Noch keine Kontakte"
        icon={Users}
      >
        <OrdiloButton onPress={onCreate} size="lg" title="Kontakt anlegen" variant="outline" />
      </EmptyState>
    );
  }

  return (
    <>
      {error ? (
        <InlineNotice actionLabel="Erneut versuchen" message={error} onAction={onRetry} />
      ) : null}

      {suggested.length > 0 && !searching ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>In Dokumenten gefunden</Text>
          <ListGroup>
            {suggested.map((contact, index) => (
              <ContactRow
                contact={contact}
                first={index === 0}
                key={contact.id}
                onPress={() =>
                  contact.source_document_id
                    ? onOpenSource(contact.source_document_id)
                    : onOpen(contact.id)
                }
                review
                sourceTitle={sourceOf(contact)}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.title} style={styles.group}>
          <Text style={styles.groupLabel}>{section.title}</Text>
          <ListGroup>
            {section.data.map((contact, index) => (
              <ContactRow
                contact={contact}
                first={index === 0}
                key={contact.id}
                onPress={() => onOpen(contact.id)}
                sourceTitle={sourceOf(contact)}
              />
            ))}
          </ListGroup>
        </View>
      ))}

      {searching && sections.length === 0 ? (
        <FilteredEmptyState
          activeFilterCount={0}
          onReset={onResetSearch}
          query={query}
        />
      ) : null}
    </>
  );
}

/** A contact row says where Ordilo met this person, so it never feels made up. */
function ContactRow({
  contact,
  first,
  onPress,
  review = false,
  sourceTitle,
}: {
  contact: Contact;
  first: boolean;
  onPress: () => void;
  review?: boolean;
  sourceTitle?: string;
}) {
  return (
    <ListRow
      accessibilityHint={
        review
          ? "Öffnet das Dokument, in dem dieser Kontakt gefunden wurde"
          : "Öffnet die Kontaktdaten"
      }
      accessibilityLabel={sourceTitle ? `${contact.name}, aus ${sourceTitle}` : contact.name}
      chevron={!review}
      first={first}
      leading={<ContactAvatar name={contact.name} />}
      meta={
        sourceTitle ? (
          <Text numberOfLines={1} style={styles.rowOrigin}>
            Aus „{sourceTitle}“
          </Text>
        ) : undefined
      }
      onPress={onPress}
      subtitle={getContactSubtitle(contact) || getContactReachLine(contact) || null}
      title={contact.name}
      trailing={review ? <Text style={styles.reviewLink}>Prüfen</Text> : undefined}
    />
  );
}

/**
 * One row for anything filed: what it is (kind icon and word), what it
 * says (Ordilo's one-liner, or the note's first line), whom it concerns
 * (faces) — and only while Ordilo still needs something, a quiet state
 * pill instead of the faces. A typed note reads as "Notiz" and a login
 * as "Zugangsdaten" wherever they appear, so the mixed list stays clear.
 */
function DocumentRow({
  document,
  first,
  onPress,
  people,
}: {
  document: LibraryDocument;
  first: boolean;
  onPress: () => void;
  people: Person[];
}) {
  const group = getLibraryEntryGroup(document);
  const kind = group === "notes" ? getDocumentKind("note") : getDocumentKind(document.document_type);
  const KindIcon = kind.icon;
  // A login's text may hold the secret itself, so its row never previews it.
  const preview =
    group === "notes"
      ? getManualNotePreview(document.ocr_text, document.title)
      : group === "documents"
        ? document.summary
        : null;
  const tone = getDocumentStatusTone(document.status);
  const statusLabel =
    tone === "processing"
      ? "Wird gelesen"
      : tone
        ? getDocumentStatusLabel(document.status)
        : null;
  const meta = [kind.label, formatDocumentDate(document.created_at), formatPeopleLine(people, 2)]
    .filter(Boolean)
    .join(" · ");

  let trailing: ReactNode;
  if (tone) {
    trailing = (
      <View
        style={[
          styles.statusPill,
          tone === "new" && styles.statusPillNew,
          tone === "failed" && styles.statusPillFailed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={[
            styles.statusText,
            tone === "new" && styles.statusTextNew,
            tone === "failed" && styles.statusTextFailed,
          ]}
        >
          {tone === "new" ? "Neu" : statusLabel}
        </Text>
      </View>
    );
  } else if (people.length > 0) {
    trailing = <AvatarStack people={people} size={26} />;
  }

  return (
    <ListRow
      accessibilityHint={tone === "new" ? "Öffnet das Dokument zum Prüfen" : `Öffnet ${group === "documents" ? "das Dokument" : group === "notes" ? "die Notiz" : "den Zugang"}`}
      accessibilityLabel={`${kind.label}: ${getDocumentTitle(document)}, ${getDocumentStatusLabel(document.status)}`}
      first={first}
      leading={
        <IconTile tint={kind.tint}>
          <KindIcon color={kind.ink} size={20} strokeWidth={1.9} />
        </IconTile>
      }
      meta={
        preview ? (
          <Text numberOfLines={1} style={styles.rowSummary}>
            {preview}
          </Text>
        ) : undefined
      }
      onPress={onPress}
      subtitle={meta}
      title={getDocumentTitle(document)}
      trailing={trailing}
    />
  );
}

function FilteredEmptyState({
  activeFilterCount,
  onLoadMore,
  query,
  onReset,
}: {
  activeFilterCount: number;
  onLoadMore?: () => void;
  query: string;
  onReset: () => void;
}) {
  const searched = Boolean(query.trim());
  return (
    <View style={styles.filteredEmpty}>
      <Search color={colors.mist} size={28} strokeWidth={1.5} />
      <Text style={styles.filteredEmptyTitle}>
        {searched ? `Nichts zu „${query.trim()}“` : "Hier passt nichts"}
      </Text>
      <Text style={styles.filteredEmptyText}>
        {searched
          ? "Versuch es mit einem anderen Wort oder frag Ordilo direkt."
          : "Probier einen anderen Filter aus."}
      </Text>
      {(searched || activeFilterCount > 0) && (
        <OrdiloButton onPress={onReset} title="Filter zurücksetzen" variant="ghost" />
      )}
      {onLoadMore ? (
        <OrdiloButton onPress={onLoadMore} title="Weitere laden" variant="outline" />
      ) : null}
    </View>
  );
}

function LibraryFilterSheet({
  documentType,
  members,
  onApply,
  onClose,
  onDocumentTypeChange,
  onPersonChange,
  onReset,
  onStatusChange,
  personId,
  status,
  visible,
}: {
  documentType: DocumentType | "all";
  members: FamilyMemberOption[];
  onApply: () => void;
  onClose: () => void;
  onDocumentTypeChange: (documentType: DocumentType | "all") => void;
  onPersonChange: (personId: string | "all") => void;
  onReset: () => void;
  onStatusChange: (status: LibraryFilters["status"]) => void;
  personId: string | "all";
  status: LibraryFilters["status"];
  visible: boolean;
}) {
  const [picker, setPicker] = useState<
    "status" | "documentType" | "person" | null
  >(null);
  const statusLabel =
    libraryStatusFilters.find((filter) => filter.value === status)?.label ??
    "Alle";
  const documentTypeLabel =
    documentType === "all"
      ? "Alle Arten"
      : documentTypeLabels[documentType];
  const member = members.find((option) => option.id === personId) ?? null;
  const personLabel = member?.name ?? "Alle Personen";
  const closeSheet = () => {
    setPicker(null);
    onClose();
  };

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Filter schließen"
      onClose={closeSheet}
      subtitle="Wähle aus, was du sehen möchtest."
      title="Dokumente filtern"
      visible={visible}
    >
      <OrdiloFormBody contentContainerStyle={styles.filterSheetBody}>
        <OrdiloFormField label="Status">
          <OrdiloFormSelect
            accessibilityHint="Öffnet die Statusauswahl"
            accessibilityLabel={`Status: ${statusLabel}`}
            onPress={() => setPicker("status")}
            trailing={<ChevronDown color={colors.mist} size={18} />}
            value={statusLabel}
          />
        </OrdiloFormField>
        <OrdiloFormField label="Dokumentart">
          <OrdiloFormSelect
            accessibilityHint="Öffnet die Auswahl der Dokumentart"
            accessibilityLabel={`Dokumentart: ${documentTypeLabel}`}
            onPress={() => setPicker("documentType")}
            trailing={<ChevronDown color={colors.mist} size={18} />}
            value={documentTypeLabel}
          />
        </OrdiloFormField>
        <OrdiloFormField label="Person">
          <OrdiloFormSelect
            accessibilityHint="Öffnet die Personenauswahl"
            accessibilityLabel={`Person: ${personLabel}`}
            leading={
              member ? (
                <PersonAvatar
                  person={{
                    color: member.avatar_color,
                    name: member.name,
                  }}
                  size={30}
                />
              ) : (
                <Users color={colors.mistDark} size={18} strokeWidth={1.9} />
              )
            }
            onPress={() => setPicker("person")}
            trailing={<ChevronDown color={colors.mist} size={18} />}
            value={personLabel}
          />
        </OrdiloFormField>
      </OrdiloFormBody>
      <OrdiloFormFooter
        primary={
          <OrdiloButton
            onPress={onApply}
            size="lg"
            title="Anwenden"
          />
        }
        secondary={
          <OrdiloButton
            onPress={onReset}
            size="lg"
            title="Zurücksetzen"
            variant="outline"
          />
        }
      />
      {/* Picker overlays must be siblings of the scrolling body. Rendering
          them inside it clips the nested sheet to the body's viewport. */}
        <OrdiloPickerOverlay
          onClose={() => setPicker(null)}
          options={libraryStatusFilters.map((filter) => ({
            key: filter.value,
            label: filter.label,
            onPress: () => {
              onStatusChange(filter.value);
              setPicker(null);
            },
            selected: status === filter.value,
          }))}
          title="Status"
          visible={picker === "status"}
        />
        <OrdiloPickerOverlay
          onClose={() => setPicker(null)}
          options={[
            {
              key: "all",
              label: "Alle Arten",
              onPress: () => {
                onDocumentTypeChange("all");
                setPicker(null);
              },
              selected: documentType === "all",
            },
            ...documentTypes.map(([value, label]) => {
              const kind = getDocumentKind(value);
              const KindIcon = kind.icon;
              return {
                key: value,
                label,
                leading: (
                  <IconTile size={32} tint={kind.tint}>
                    <KindIcon
                      color={kind.ink}
                      size={16}
                      strokeWidth={1.9}
                    />
                  </IconTile>
                ),
                onPress: () => {
                  onDocumentTypeChange(value);
                  setPicker(null);
                },
                selected: documentType === value,
              };
            }),
          ]}
          title="Dokumentart"
          visible={picker === "documentType"}
        />
        <OrdiloPickerOverlay
          onClose={() => setPicker(null)}
          options={[
            {
              key: "all",
              label: "Alle Personen",
              leading: (
                <IconTile size={32} tint={colors.sandLight}>
                  <Users color={colors.mistDark} size={16} strokeWidth={1.9} />
                </IconTile>
              ),
              onPress: () => {
                onPersonChange("all");
                setPicker(null);
              },
              selected: personId === "all",
            },
            ...members.map((option) => ({
              key: option.id,
              label: option.name,
              leading: (
                <PersonAvatar
                  person={{
                    color: option.avatar_color,
                    name: option.name,
                  }}
                  size={32}
                />
              ),
              onPress: () => {
                onPersonChange(option.id);
                setPicker(null);
              },
              selected: personId === option.id,
            })),
          ]}
          title="Person"
          visible={picker === "person"}
        />
    </OrdiloFormSheet>
  );
}

function SortPicker({
  onClose,
  onSelect,
  selected,
  visible,
}: {
  onClose: () => void;
  onSelect: (sort: LibrarySort) => void;
  selected: LibrarySort;
  visible: boolean;
}) {
  return (
    <OrdiloPickerSheet
      accessibilityLabel="Sortierung auswählen"
      onClose={onClose}
      options={librarySortOptions.map((option) => ({
        key: option.value,
        label: option.label,
        onPress: () => onSelect(option.value),
        selected: selected === option.value,
      }))}
      title="Sortieren"
      visible={visible}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { gap: spacing.md, paddingBottom: MOBILE_DOCK_CONTENT_INSET },
  ambientBehind: { marginHorizontal: -spacing.md },
  search: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 46,
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchInput: {
    color: colors.graphite,
    flex: 1,
    minHeight: 44,
    ...typography.body,
  },
  searchClear: {
    alignItems: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  libraryToolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  resultsContent: { gap: spacing.md },
  viewContent: { gap: spacing.md },
  sortControl: {
    alignItems: "flex-end",
    flex: 1,
  },
  chipRow: { marginHorizontal: -spacing.md },
  chips: { gap: spacing.xs, paddingHorizontal: spacing.md },
  filterSheetBody: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  group: { gap: spacing.xs },
  groupLabel: {
    color: colors.mistDark,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    ...typography.caption,
  },
  rowDate: { color: colors.mistDark, ...typography.caption },
  rowSummary: { color: colors.graphite, ...typography.timestamp },
  rowOrigin: { color: colors.mistDark, ...typography.caption },
  listEnd: { alignItems: "center", minHeight: 44, justifyContent: "center" },
  listEndText: {
    color: colors.mistDark,
    paddingVertical: spacing.sm,
    textAlign: "center",
    ...typography.caption,
  },
  reviewLink: { color: colors.harborBlue, ...typography.caption },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 4,
    maxWidth: 128,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillNew: { backgroundColor: colors.harborBlue },
  statusPillFailed: { backgroundColor: colors.destructiveBackground },
  statusText: { color: colors.mistDark, ...typography.caption },
  statusTextNew: { color: colors.warmWhite },
  statusTextFailed: { color: colors.destructive },
  filteredEmpty: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  filteredLoading: { marginTop: spacing.xl },
  filteredEmptyTitle: { color: colors.graphite, textAlign: "center", ...typography.title },
  filteredEmptyText: { color: colors.mistDark, textAlign: "center", ...typography.timestamp },
});
