import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowDownAZ,
  BookOpen,
  FilePlus2,
  NotebookPen,
  Plus,
  ScanLine,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
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

import { AmbientFields } from "@/src/components/ambient-fields";
import { CreateChoiceSheet } from "@/src/components/create-choice-sheet";
import {
  ContactAvatar,
  ContactFormSheet,
} from "@/src/components/contacts";
import { NoteFormSheet } from "@/src/components/note-form-sheet";
import { MOBILE_DOCK_CONTENT_INSET } from "@/src/components/ordilo-tab-bar";
import { AvatarStack } from "@/src/components/person";
import { OrdiloPickerSheet } from "@/src/components/picker-sheet";
import type { OrdiloSheetHandle } from "@/src/components/sheet";
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
  SegmentedControl,
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
  mergeSavedContact,
  splitContactsByStatus,
  type Contact,
} from "@/src/lib/contacts";
import { useFamily } from "@/src/lib/family-context";
import { tap } from "@/src/lib/feedback";
import { createNote, triggerNoteAnalysis } from "@/src/lib/notes";
import {
  filterLibraryDocuments,
  formatDocumentDate,
  getDocumentSearchText,
  getDocumentStatusLabel,
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
  loadLibraryDocumentPeople,
  mergeLibraryDocuments,
  subscribeToLibraryChanges,
  toLibrarySearchPattern,
  type LibraryDocument,
  type LibraryFilters,
  type LibrarySort,
} from "@/src/lib/library";
import { formatPeopleLine, type Person } from "@/src/lib/people";
import { getSupabase } from "@/src/lib/supabase";
import { fetchFamilyMembers, type FamilyMemberOption } from "@/src/lib/tasks";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const documentTypes = Object.entries(documentTypeLabels) as [
  DocumentType,
  string,
][];
type LibraryView = "documents" | "notes" | "contacts";
type CreateKind = "document" | "note" | "contact";

/**
 * Dokumente — the family's filing place. Three views (Unterlagen, Notizen,
 * Kontakte) share one header and one search. Rows say what a document is
 * (kind icon), whom it concerns (faces) and, only when it is not settled
 * yet, what Ordilo still needs (Neu, wird gelesen, Fehler). Date-sorted
 * lists are grouped by week and month so a year of paperwork keeps its
 * bearings.
 */
export default function AblageScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [people, setPeople] = useState<Map<string, Person[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsRefreshing, setContactsRefreshing] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [view, setView] = useState<LibraryView>("documents");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [filters, setFilters] = useState<LibraryFilters>({
    query: "",
    status: "all",
    documentType: "all",
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
        // The explicit family predicate narrows the library to the resolved
        // family; RLS remains the authority for this anon-key client.
        let query = getSupabase()
          .from("documents")
          .select(libraryDocumentSelect)
          .eq("family_id", family.id);
        // Notes are documents with source "manual"; the two views split
        // on that predicate so each list only ever shows its own kind.
        query = view === "notes"
          ? query.eq("source", "manual")
          : query.neq("source", "manual");
        if (filters.status === "needs_review") query = query.eq("status", "analyzed");
        if (filters.status === "confirmed") query = query.eq("status", "confirmed");
        if (filters.status === "failed") query = query.eq("status", "failed");
        if (filters.status === "processing") {
          query = query.in("status", ["uploaded", "ocr_processing", "ocr_done", "analyzing"]);
        }
        if (filters.documentType !== "all") {
          query = query.eq("document_type", filters.documentType);
        }
        if (filters.query.trim()) {
          const pattern = toLibrarySearchPattern(filters.query);
          query = query.or(
            `title.ilike.${pattern},original_filename.ilike.${pattern},summary.ilike.${pattern},ocr_text.ilike.${pattern}`,
          );
        }
        const { data, error: queryError } = await query
          .order(order.column, { ascending: order.ascending })
          .range(range.from, range.to);
        if (queryError) throw queryError;
        const next = (data ?? []) as LibraryDocument[];
        if (isCurrentRequest()) {
          setDocuments((current) =>
            append ? mergeLibraryDocuments(current, next) : next,
          );
          setHasMore(next.length === libraryPageSize);
          setNextPage(next.length === libraryPageSize ? page + 1 : page);
        }
        if (view === "documents" && next.length > 0) {
          // People arrive a beat after the rows; the list never waits for them.
          const pagePeople = await loadLibraryDocumentPeople(
            next.map((document) => document.id),
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
      setContacts(await loadContacts(family.id));
    } catch {
      setContactsError(
        "Deine Kontakte konnten nicht geladen werden. Bitte versuch es nochmal.",
      );
    } finally {
      setContactsLoading(false);
      setContactsRefreshing(false);
    }
  }, [family]);

  useFocusEffect(useCallback(() => {
    if (view === "contacts") void loadContactRows();
  }, [loadContactRows, view]));

  const reloadDocuments = useCallback(() => {
    void loadDocuments({ refresh: true });
  }, [loadDocuments]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    void loadDocuments({ append: true, page: nextPage });
  }, [hasMore, loadDocuments, loadingMore, nextPage]);

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
    if (kind === "note") setCreateNoteOpen(true);
    if (kind === "contact") setCreateContactOpen(true);
  }, [router]);

  const chooseSort = useCallback((nextSort: LibrarySort) => {
    setSort(nextSort);
    setSortPickerOpen(false);
  }, []);

  const sortedLabel = useMemo(
    () => librarySortOptions.find((option) => option.value === sort)?.label ?? "Neueste zuerst",
    [sort],
  );

  const subtitle = useMemo(() => {
    if (view === "contacts") {
      if (contactsLoading && contacts.length === 0) return "Kontakte werden geladen";
      const confirmedCount = splitContactsByStatus(contacts).confirmed.length;
      if (confirmedCount === 0) return "Wichtige Menschen aus euren Unterlagen";
      return confirmedCount === 1 ? "1 Kontakt" : `${confirmedCount} Kontakte`;
    }
    if (loading && documents.length === 0) {
      return view === "notes" ? "Notizen werden geladen" : "Unterlagen werden geladen";
    }
    const suffix = hasMore ? "+" : "";
    if (view === "notes") {
      if (documents.length === 0) return "Familienwissen, das nirgends auf Papier steht";
      return documents.length === 1 ? "1 Notiz" : `${documents.length}${suffix} Notizen`;
    }
    if (documents.length === 0) return "Alles, was Ordilo für euch gelesen hat";
    return documents.length === 1 ? "1 Dokument" : `${documents.length}${suffix} Dokumente`;
  }, [contacts, contactsLoading, documents.length, hasMore, loading, view]);

  const visibleDocuments = useMemo(
    () => filterLibraryDocuments(documents, filters),
    [documents, filters],
  );
  const groups = useMemo(
    () => groupLibraryDocuments(visibleDocuments, sort),
    [visibleDocuments, sort],
  );
  const activeFilterCount =
    Number(filters.status !== "all") + Number(filters.documentType !== "all");
  const hasActiveFilters =
    filters.query.trim() !== "" || activeFilterCount > 0;
  const selectedTypeLabel =
    filters.documentType === "all"
      ? "Art"
      : documentTypeLabels[filters.documentType];

  const switchView = useCallback((nextView: LibraryView) => {
    if (nextView === view) return;
    tap();
    if (nextView === "contacts") {
      requestGeneration.current += 1;
      if (contacts.length === 0) setContactsLoading(true);
      setView(nextView);
      return;
    }
    // Invalidate the previous source query before replacing the visible
    // list. A slow Documents response must never populate the Notes view.
    requestGeneration.current += 1;
    setDocuments([]);
    setError(null);
    setHasMore(false);
    setLoading(true);
    setNextPage(1);
    setFilters({ query: "", status: "all", documentType: "all" });
    setView(nextView);
  }, [contacts.length, view]);

  const handleContactCreated = useCallback((saved: Contact) => {
    setContacts((current) => mergeSavedContact(current, saved));
    setCreateContactOpen(false);
    setView("contacts");
  }, []);

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

  const showDocumentControls =
    view === "documents" && (documents.length > 0 || hasActiveFilters);

  return (
    <Screen>
      <AmbientFields style={styles.ambientBehind} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() =>
              view === "contacts"
                ? void loadContactRows({ refresh: true })
                : reloadDocuments()
            }
            refreshing={
              view === "contacts" ? contactsRefreshing : refreshing
            }
            tintColor={colors.harborBlue}
          />
        }
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

        <SegmentedControl
          items={[
            {
              icon: BookOpen,
              label: "Unterlagen",
              onPress: () => switchView("documents"),
              selected: view === "documents",
            },
            {
              icon: NotebookPen,
              label: "Notizen",
              onPress: () => switchView("notes"),
              selected: view === "notes",
            },
            {
              icon: Users,
              label: "Kontakte",
              onPress: () => switchView("contacts"),
              selected: view === "contacts",
            },
          ]}
        />

        {view === "contacts" ? (
          <ContactsView
            contacts={contacts}
            error={contactsError}
            loading={contactsLoading}
            onOpen={(contactId) => router.push(`/contacts/${contactId}`)}
            onOpenSource={(documentId) =>
              router.push(`/document/${documentId}`)
            }
            onQueryChange={setContactQuery}
            onRetry={() => void loadContactRows()}
            query={contactQuery}
          />
        ) : view === "notes" ? (
          <NotesView
            error={error}
            hasMore={hasMore}
            loading={loading}
            loadingMore={loadingMore}
            notes={documents}
            onCreate={() => setCreateNoteOpen(true)}
            onLoadMore={loadMore}
            onOpen={(documentId) => router.push(`/note/${documentId}`)}
            onSearchChange={(query) =>
              setFilters((current) => ({ ...current, query }))
            }
            onRetry={() => void loadDocuments()}
            search={filters.query}
          />
        ) : loading && documents.length === 0 && !hasActiveFilters ? (
          <ListSkeleton rows={6} />
        ) : showDocumentControls ? (
          <>
            <SearchField
              accessibilityLabel="Unterlagen durchsuchen"
              onChangeText={(query) =>
                setFilters((current) => ({ ...current, query }))
              }
              placeholder="Titel, Inhalt oder Absender"
              value={filters.query}
            />

            <ScrollView
              contentContainerStyle={styles.chips}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
            >
              {libraryStatusFilters.map((filter) => (
                <Chip
                  key={filter.value}
                  label={filter.label}
                  onPress={() =>
                    setFilters((current) => ({
                      ...current,
                      status: filter.value,
                    }))
                  }
                  selected={filters.status === filter.value}
                  tone={filter.value === "needs_review" ? "attention" : "neutral"}
                />
              ))}
              <View style={styles.chipDivider} />
              <Chip
                accessibilityLabel={`Dokumentart: ${selectedTypeLabel}`}
                icon={filters.documentType === "all" ? SlidersHorizontal : undefined}
                label={selectedTypeLabel}
                onPress={() => setTypePickerOpen(true)}
                selected={filters.documentType !== "all"}
              />
              <Chip
                accessibilityLabel={`Sortierung: ${sortedLabel}`}
                icon={ArrowDownAZ}
                label={sortedLabel}
                onPress={() => setSortPickerOpen(true)}
              />
            </ScrollView>

            {error ? (
              <InlineNotice
                actionLabel="Erneut versuchen"
                message={error}
                onAction={() => void loadDocuments({ refresh: documents.length > 0 })}
              />
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
                        <DocumentRow
                          document={document}
                          first={index === 0}
                          key={document.id}
                          onPress={() =>
                            router.push(
                              isManualNote(document)
                                ? `/note/${document.id}`
                                : `/document/${document.id}`,
                            )
                          }
                          people={people.get(document.id) ?? []}
                        />
                      ))}
                    </ListGroup>
                  </View>
                ))}
                {hasMore ? (
                  <OrdiloButton
                    disabled={loadingMore}
                    icon={loadingMore ? <ActivityIndicator color={colors.harborBlue} size="small" /> : undefined}
                    onPress={loadMore}
                    size="lg"
                    title={loadingMore ? "Weitere werden geladen …" : "Weitere Dokumente laden"}
                    variant="outline"
                  />
                ) : null}
              </>
            ) : (
              <FilteredEmptyState
                activeFilterCount={activeFilterCount}
                query={filters.query}
                onLoadMore={hasMore ? loadMore : undefined}
                onReset={() =>
                  setFilters({ query: "", status: "all", documentType: "all" })
                }
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={BookOpen}
            heading="Noch keine Unterlagen"
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
      </ScrollView>

      <DocumentTypePicker
        onClose={() => setTypePickerOpen(false)}
        onSelect={(documentType) => {
          setFilters((current) => ({ ...current, documentType }));
          setTypePickerOpen(false);
        }}
        selected={filters.documentType}
        visible={typePickerOpen}
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
            description: "Familienwissen direkt festhalten",
            icon: NotebookPen,
            label: "Notiz",
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
        onClose={() => setCreateNoteOpen(false)}
        onSubmit={createNewNote}
        visible={createNoteOpen}
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
          hitSlop={8}
          onPress={() => onChangeText("")}
          style={styles.searchClear}
        >
          <X color={colors.mistDark} size={14} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The notes list: its own search, its own empty states, and a create
 * call-to-action that is always one tap away. Notes live in the same
 * documents table (source "manual") but read as their own thing here.
 */
function NotesView({
  error,
  hasMore,
  loading,
  loadingMore,
  notes,
  onCreate,
  onLoadMore,
  onOpen,
  onRetry,
  onSearchChange,
  search,
}: {
  error: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  notes: LibraryDocument[];
  onCreate: () => void;
  onLoadMore: () => void;
  onOpen: (documentId: string) => void;
  onRetry: () => void;
  onSearchChange: (query: string) => void;
  search: string;
}) {
  const visibleNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    if (!query) return notes;
    return notes.filter((note) => getDocumentSearchText(note).includes(query));
  }, [notes, search]);

  if (loading && notes.length === 0 && !search.trim()) {
    return <ListSkeleton rows={4} />;
  }

  if (error && notes.length === 0 && !search.trim()) {
    return (
      <EmptyState icon={AlertCircle} heading="Notizen nicht erreichbar" description={error}>
        <OrdiloButton onPress={onRetry} size="lg" title="Erneut versuchen" />
      </EmptyState>
    );
  }

  if (notes.length === 0 && !search.trim()) {
    return (
      <EmptyState
        icon={NotebookPen}
        heading="Noch keine Notizen"
        description="WLAN-Passwort, Schuhgröße, die Nummer vom Hausmeister: Dinge, die nirgends auf Papier stehen, aber jeder braucht."
      >
        <OrdiloButton onPress={onCreate} size="lg" title="Erste Notiz anlegen" />
      </EmptyState>
    );
  }

  return (
    <>
      <SearchField
        accessibilityLabel="Notizen durchsuchen"
        onChangeText={onSearchChange}
        placeholder="Notizen durchsuchen"
        value={search}
      />
      {error ? (
        <InlineNotice actionLabel="Erneut versuchen" message={error} onAction={onRetry} />
      ) : null}
      {visibleNotes.length === 0 ? (
        <FilteredEmptyState
          activeFilterCount={0}
          onReset={() => onSearchChange("")}
          query={search}
        />
      ) : (
        <ListGroup>
          {visibleNotes.map((note, index) => (
            <ListRow
              accessibilityHint="Öffnet die Notiz"
              chevron
              first={index === 0}
              key={note.id}
              leading={
                <IconTile tint={colors.washSageSoft}>
                  <NotebookPen color="#2F6B52" size={20} strokeWidth={1.9} />
                </IconTile>
              }
              onPress={() => onOpen(note.id)}
              subtitle={
                note.summary?.trim() ||
                note.ocr_text?.trim() ||
                "Notiz öffnen, um den Inhalt zu lesen"
              }
              title={getDocumentTitle(note)}
              trailing={
                <Text style={styles.rowDate}>{formatDocumentDate(note.created_at)}</Text>
              }
            />
          ))}
        </ListGroup>
      )}
      {hasMore ? (
        <OrdiloButton
          disabled={loadingMore}
          icon={loadingMore ? <ActivityIndicator color={colors.harborBlue} size="small" /> : undefined}
          onPress={onLoadMore}
          size="lg"
          title={loadingMore ? "Weitere werden geladen …" : "Weitere Notizen laden"}
          variant="outline"
        />
      ) : null}
    </>
  );
}

function ContactsView({
  contacts,
  error,
  loading,
  onOpen,
  onOpenSource,
  onQueryChange,
  onRetry,
  query,
}: {
  contacts: Contact[];
  error: string | null;
  loading: boolean;
  onOpen: (contactId: string) => void;
  onOpenSource: (documentId: string) => void;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
  query: string;
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
      />
    );
  }

  return (
    <>
      <SearchField
        accessibilityLabel="Kontakte durchsuchen"
        onChangeText={onQueryChange}
        placeholder="Name oder Organisation"
        value={query}
      />

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
              />
            ))}
          </ListGroup>
        </View>
      ))}

      {searching && sections.length === 0 ? (
        <FilteredEmptyState
          activeFilterCount={0}
          onReset={() => onQueryChange("")}
          query={query}
        />
      ) : null}
    </>
  );
}

function ContactRow({
  contact,
  first,
  onPress,
  review = false,
}: {
  contact: Contact;
  first: boolean;
  onPress: () => void;
  review?: boolean;
}) {
  return (
    <ListRow
      accessibilityHint={
        review
          ? "Öffnet das Dokument, in dem dieser Kontakt gefunden wurde"
          : "Öffnet die Kontaktdaten"
      }
      accessibilityLabel={contact.name}
      chevron={!review}
      first={first}
      leading={<ContactAvatar name={contact.name} />}
      onPress={onPress}
      subtitle={getContactSubtitle(contact) || getContactReachLine(contact) || null}
      title={contact.name}
      trailing={review ? <Text style={styles.reviewLink}>Prüfen</Text> : undefined}
    />
  );
}

/**
 * One document row: what it is (kind icon), what it says (title and
 * Ordilo's one-liner), whom it concerns (faces) — and only while Ordilo
 * still needs something, a quiet state pill instead of the faces.
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
  const kind = getDocumentKind(document.document_type);
  const KindIcon = kind.icon;
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
      accessibilityHint={tone === "new" ? "Öffnet das Dokument zum Prüfen" : "Öffnet das Dokument"}
      accessibilityLabel={`${getDocumentTitle(document)}, ${getDocumentStatusLabel(document.status)}`}
      first={first}
      leading={
        <IconTile tint={kind.tint}>
          <KindIcon color={kind.ink} size={20} strokeWidth={1.9} />
        </IconTile>
      }
      meta={
        document.summary ? (
          <Text numberOfLines={1} style={styles.rowSummary}>
            {document.summary}
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
        <OrdiloButton onPress={onLoadMore} title="Weitere Dokumente laden" variant="outline" />
      ) : null}
    </View>
  );
}

function DocumentTypePicker({
  onClose,
  onSelect,
  selected,
  visible,
}: {
  onClose: () => void;
  onSelect: (documentType: DocumentType | "all") => void;
  selected: DocumentType | "all";
  visible: boolean;
}) {
  return (
    <OrdiloPickerSheet
      accessibilityLabel="Dokumentart auswählen"
      onClose={onClose}
      options={[
        {
          key: "all",
          label: "Alle Arten",
          onPress: () => onSelect("all"),
          selected: selected === "all",
        },
        ...documentTypes.map(([value, label]) => {
          const kind = getDocumentKind(value);
          const KindIcon = kind.icon;
          return {
            key: value,
            label,
            leading: (
              <IconTile size={32} tint={kind.tint}>
                <KindIcon color={kind.ink} size={16} strokeWidth={1.9} />
              </IconTile>
            ),
            onPress: () => onSelect(value),
            selected: selected === value,
          };
        }),
      ]}
      title="Dokumentart"
      visible={visible}
    />
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
    height: 46,
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchInput: { color: colors.graphite, flex: 1, height: 44, ...typography.body },
  searchClear: {
    alignItems: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  chipRow: { marginHorizontal: -spacing.md },
  chips: { gap: spacing.xs, paddingHorizontal: spacing.md },
  chipDivider: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    height: 20,
    marginHorizontal: spacing.xs,
    width: 1,
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
