import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus2,
  NotebookPen,
  Plus,
  Search,
  SlidersHorizontal,
  ArrowDownAZ,
  UserPlus,
  Users,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { OrdiloPickerSheet } from "@/src/components/picker-sheet";
import type { OrdiloSheetHandle } from "@/src/components/sheet";
import {
  EmptyState,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SpringPressable,
} from "@/src/components/ui";
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
import { createNote, triggerNoteAnalysis } from "@/src/lib/notes";
import {
  filterLibraryDocuments,
  formatDocumentDate,
  getDocumentSearchText,
  getDocumentStatusLabel,
  getDocumentTitle,
  getDocumentTypeLabel,
  isManualNote,
  getLibraryPageRange,
  getLibrarySortOrder,
  toLibrarySearchPattern,
  libraryPageSize,
  librarySortOptions,
  mergeLibraryDocuments,
  libraryDocumentSelect,
  libraryStatusFilters,
  subscribeToLibraryChanges,
  type LibraryDocument,
  type LibraryFilters,
  type LibrarySort,
} from "@/src/lib/library";
import { tap } from "@/src/lib/feedback";
import { getSupabase } from "@/src/lib/supabase";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const documentTypes = Object.entries(documentTypeLabels) as [
  DocumentType,
  string,
][];
type LibraryView = "documents" | "notes" | "contacts";
type CreateKind = "document" | "note" | "contact";

/**
 * Ablage — the family's RLS-scoped document library. It deliberately keeps
 * the controls close to the thumb: search, one status chip row, and a
 * compact document-type picker instead of a dense dashboard toolbar.
 */
export default function AblageScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
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

  const documentCountLabel = useMemo(() => {
    if (view === "contacts") {
      const confirmedCount = splitContactsByStatus(contacts).confirmed.length;
      if (confirmedCount === 1) return "1 Kontakt der Familie";
      return `${confirmedCount} Kontakte der Familie`;
    }
    if (view === "notes") {
      if (documents.length === 1) return "1 Notiz der Familie";
      return `${documents.length}${hasMore ? "+" : ""} Notizen der Familie`;
    }
    if (documents.length === 1) return "1 Dokument der Familie";
    return `${documents.length}${hasMore ? "+" : ""} Dokumente der Familie`;
  }, [contacts, documents.length, hasMore, view]);

  const visibleDocuments = useMemo(
    () => filterLibraryDocuments(documents, filters),
    [documents, filters],
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
          heading="Ablage nicht erreichbar"
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

  return (
    <Screen>
      <AmbientFields style={styles.ambientBehind} />
      <ScrollView
        contentContainerStyle={styles.content}
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
            accessibilityLabel: "In der Ablage anlegen",
            icon: Plus,
            onPress: () => createSheetRef.current?.present(),
          }}
          subtitle={
            view === "contacts" && contactsLoading && contacts.length === 0
              ? "Kontakte werden geladen"
              : loading && documents.length === 0
              ? view === "notes"
                ? "Notizen werden geladen"
                : "Dokumente werden geladen"
              : hasActiveFilters && documents.length === 0
              ? "Keine Treffer für deine Suche oder Filter"
              : documentCountLabel
          }
          title="Ablage"
        />

        <SegmentedControl
          items={[
            {
              icon: FileText,
              label: "Dokumente",
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
        ) : documents.length > 0 || hasActiveFilters ? (
          <>
            <View style={styles.search}>
              <Search color={colors.mistDark} size={19} strokeWidth={1.8} />
              <TextInput
                accessibilityLabel="Dokumente durchsuchen"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={(query) =>
                  setFilters((current) => ({ ...current, query }))
                }
                placeholder="Dokumente durchsuchen"
                placeholderTextColor={colors.mistDark}
                returnKeyType="search"
                style={styles.searchInput}
                value={filters.query}
              />
            </View>

            <View style={styles.filterRow}>
              <ScrollView
                contentContainerStyle={styles.chips}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {libraryStatusFilters.map((filter) => (
                  <FilterChip
                    key={filter.value}
                    label={filter.label}
                    onPress={() =>
                      setFilters((current) => ({
                        ...current,
                        status: filter.value,
                      }))
                    }
                    selected={filters.status === filter.value}
                  />
                ))}
              </ScrollView>
              <Pressable
                accessibilityHint="Wählt die Art der Dokumente aus"
                accessibilityLabel={`Dokumentart: ${selectedTypeLabel}`}
                accessibilityRole="button"
                onPress={() => setTypePickerOpen(true)}
                style={({ pressed }) => [
                  styles.typeButton,
                  filters.documentType !== "all" && styles.typeButtonSelected,
                  pressed && styles.pressed,
                ]}
              >
                <SlidersHorizontal
                  color={
                    filters.documentType !== "all"
                      ? colors.warmWhite
                      : colors.harborBlue
                  }
                  size={16}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.typeButtonText,
                    filters.documentType !== "all" && styles.typeButtonTextSelected,
                  ]}
                >
                  {selectedTypeLabel}
                </Text>
                <ChevronDown
                  color={
                    filters.documentType !== "all"
                      ? colors.warmWhite
                      : colors.harborBlue
                  }
                  size={16}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityHint="Wählt die Reihenfolge der Dokumente aus"
              accessibilityLabel={`Sortierung: ${sortedLabel}`}
              accessibilityRole="button"
              onPress={() => setSortPickerOpen(true)}
              style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
            >
              <ArrowDownAZ color={colors.mistDark} size={16} />
              <Text style={styles.sortButtonText}>{sortedLabel}</Text>
              <ChevronDown color={colors.mistDark} size={16} />
            </Pressable>

            {error ? (
              <View accessibilityRole="alert" style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{error}</Text>
                <Pressable onPress={() => void loadDocuments({ refresh: documents.length > 0 })}>
                  <Text style={styles.dismiss}>Erneut versuchen</Text>
                </Pressable>
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
                <View style={styles.list}>
                  {visibleDocuments.map((document) => (
                    <DocumentRow
                      document={document}
                      key={document.id}
                      onPress={() =>
                        router.push(
                          isManualNote(document)
                            ? `/note/${document.id}`
                            : `/document/${document.id}`,
                        )
                      }
                    />
                  ))}
                </View>
                {hasMore ? (
                  <OrdiloButton
                    disabled={loadingMore}
                    icon={loadingMore ? <ActivityIndicator color={colors.harborBlue} size="small" /> : undefined}
                    onPress={loadMore}
                    title={loadingMore ? "Weitere Dokumente werden geladen …" : "Weitere Dokumente laden"}
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
            heading="Deine Ablage ist noch leer"
            description="Scanne ein Dokument. Danach findest du es hier wieder."
          >
            <OrdiloButton
              title="Dokument scannen"
              size="lg"
              onPress={() => router.push("/scan")}
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
        accessibilityLabel="In der Ablage anlegen"
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
    return <ActivityIndicator accessibilityLabel="Notizen werden geladen" color={colors.harborBlue} style={styles.notesLoading} />;
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
        description="Lege über das Plus oben deine erste Notiz an."
      />
    );
  }

  return (
    <>
      <View style={styles.search}>
        <Search color={colors.mistDark} size={19} strokeWidth={1.8} />
        <TextInput
          accessibilityLabel="Notizen durchsuchen"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onSearchChange}
          placeholder="Notizen durchsuchen"
          placeholderTextColor={colors.mistDark}
          returnKeyType="search"
          style={styles.searchInput}
          value={search}
        />
      </View>
      {error ? (
        <View accessibilityRole="alert" style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
          <Pressable onPress={onRetry}><Text style={styles.dismiss}>Erneut versuchen</Text></Pressable>
        </View>
      ) : null}
      {visibleNotes.length === 0 ? (
        <View style={styles.filteredEmpty}>
          <Search color={colors.mist} size={28} strokeWidth={1.5} />
          <Text style={styles.filteredEmptyTitle}>Keine Notiz gefunden</Text>
          <Text style={styles.filteredEmptyText}>Versuch es mit einem anderen Wort.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visibleNotes.map((note) => (
            <NoteRow key={note.id} note={note} onPress={() => onOpen(note.id)} />
          ))}
        </View>
      )}
      {hasMore ? (
        <OrdiloButton
          disabled={loadingMore}
          icon={loadingMore ? <ActivityIndicator color={colors.harborBlue} size="small" /> : undefined}
          onPress={onLoadMore}
          title={loadingMore ? "Weitere Notizen werden geladen …" : "Weitere Notizen laden"}
          variant="outline"
        />
      ) : null}
    </>
  );
}

/** One note row: title, a one-line preview, and the creation date. */
function NoteRow({
  note,
  onPress,
}: {
  note: LibraryDocument;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Öffnet die Notiz"
      accessibilityLabel={getDocumentTitle(note)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]}
    >
      <View style={styles.documentCopy}>
        <Text numberOfLines={1} style={styles.documentTitle}>{getDocumentTitle(note)}</Text>
        <Text numberOfLines={1} style={styles.documentSummary}>
          {note.summary?.trim() || note.ocr_text?.trim() || "Notiz öffnen, um den Inhalt zu lesen"}
        </Text>
      </View>
      <Text style={styles.noteDate}>{formatDocumentDate(note.created_at)}</Text>
    </Pressable>
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
        description="Lege über das Plus oben euren ersten Kontakt an."
        heading="Noch keine Kontakte"
        icon={Users}
      />
    );
  }

  return (
    <>
      <View style={styles.search}>
        <Search color={colors.mistDark} size={19} strokeWidth={1.8} />
        <TextInput
          accessibilityLabel="Kontakte durchsuchen"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="Kontakte durchsuchen"
          placeholderTextColor={colors.mistDark}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
      </View>

      {error ? (
        <View accessibilityRole="alert" style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
          <Pressable onPress={onRetry}>
            <Text style={styles.dismiss}>Erneut versuchen</Text>
          </Pressable>
        </View>
      ) : null}

      {suggested.length > 0 ? (
        <View style={styles.contactSection}>
          <Text style={styles.contactSectionTitle}>
            In Dokumenten gefunden
          </Text>
          <View style={styles.list}>
            {suggested.map((contact) => (
              <ContactRow
                contact={contact}
                key={contact.id}
                onPress={() =>
                  contact.source_document_id
                    ? onOpenSource(contact.source_document_id)
                    : onOpen(contact.id)
                }
                review
              />
            ))}
          </View>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.title} style={styles.contactSection}>
          <Text style={styles.contactSectionTitle}>{section.title}</Text>
          <View style={styles.list}>
            {section.data.map((contact) => (
              <ContactRow
                contact={contact}
                key={contact.id}
                onPress={() => onOpen(contact.id)}
              />
            ))}
          </View>
        </View>
      ))}

      {searching && sections.length === 0 ? (
        <View style={styles.filteredEmpty}>
          <Search color={colors.mist} size={28} strokeWidth={1.5} />
          <Text style={styles.filteredEmptyTitle}>
            Kein Kontakt gefunden
          </Text>
          <Text style={styles.filteredEmptyText}>
            Versuch es mit einem anderen Namen.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function ContactRow({
  contact,
  onPress,
  review = false,
}: {
  contact: Contact;
  onPress: () => void;
  review?: boolean;
}) {
  return (
    <Pressable
      accessibilityHint={
        review
          ? "Öffnet das Dokument, in dem dieser Kontakt gefunden wurde"
          : "Öffnet die Kontaktdaten"
      }
      accessibilityLabel={contact.name}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactRow,
        pressed && styles.pressed,
      ]}
    >
      <ContactAvatar name={contact.name} />
      <View style={styles.documentCopy}>
        <Text numberOfLines={1} style={styles.documentTitle}>
          {contact.name}
        </Text>
        {getContactSubtitle(contact) || getContactReachLine(contact) ? (
          <Text numberOfLines={1} style={styles.documentMeta}>
            {getContactSubtitle(contact) || getContactReachLine(contact)}
          </Text>
        ) : null}
      </View>
      {review ? (
        <Text style={styles.contactReview}>Prüfen</Text>
      ) : (
        <ChevronRight color={colors.mistDark} size={18} />
      )}
    </Pressable>
  );
}

function FilterChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DocumentRow({
  document,
  onPress,
}: {
  document: LibraryDocument;
  onPress: () => void;
}) {
  const typeLabel = getDocumentTypeLabel(document.document_type);
  const needsReview = document.status === "analyzed";
  const failed = document.status === "failed";

  return (
    <SpringPressable
      accessibilityHint="Öffnet die Dokumentansicht"
      accessibilityLabel={`${getDocumentTitle(document)}, ${getDocumentStatusLabel(document.status)}`}
      haptic={false}
      onPress={onPress}
      style={styles.documentRow}
    >
      <View style={styles.documentIcon}>
        <FileText color={colors.mistDark} size={20} strokeWidth={1.7} />
      </View>
      <View style={styles.documentCopy}>
        <Text numberOfLines={1} style={styles.documentTitle}>
          {getDocumentTitle(document)}
        </Text>
        <Text numberOfLines={1} style={styles.documentMeta}>
          {[typeLabel, formatDocumentDate(document.created_at)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {document.summary ? (
          <Text numberOfLines={1} style={styles.documentSummary}>
            {document.summary}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.status,
          needsReview && styles.statusReview,
          failed && styles.statusFailed,
        ]}
      >
        {document.status === "confirmed" ? (
          <CheckCircle2 color={colors.harborBlue} size={14} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.statusText,
            needsReview && styles.statusReviewText,
            failed && styles.statusFailedText,
          ]}
        >
          {getDocumentStatusLabel(document.status)}
        </Text>
      </View>
    </SpringPressable>
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
        {searched ? "Nichts gefunden" : "Hier passt nichts"}
      </Text>
      <Text style={styles.filteredEmptyText}>
        {searched
          ? "Versuch es mit einem anderen Wort."
          : "Probier einen anderen Filter aus."}
      </Text>
      {(searched || activeFilterCount > 0) && (
        <OrdiloButton onPress={onReset} title="Filter löschen" variant="ghost" />
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
        ...documentTypes.map(([value, label]) => ({
          key: value,
          label,
          onPress: () => onSelect(value),
          selected: selected === value,
        })),
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
  noteDate: { color: colors.mistDark, ...typography.label },
  notesLoading: { marginTop: spacing["2xl"] },
  contactSection: { gap: spacing.xs },
  contactSectionTitle: {
    color: colors.mistDark,
    paddingHorizontal: spacing.xs,
    ...typography.label,
  },
  contactRow: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 68,
    padding: spacing.sm,
  },
  contactReview: {
    color: colors.harborBlue,
    ...typography.label,
  },
  search: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: 12,
  },
  searchInput: { color: colors.graphite, flex: 1, ...typography.body },
  filterRow: { flexDirection: "row", gap: spacing.sm },
  chips: { gap: spacing.xs, paddingRight: spacing.xs },
  chip: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: colors.harborBlue, borderColor: colors.harborBlue },
  chipText: { color: colors.mistDark, ...typography.label },
  chipTextSelected: { color: colors.warmWhite },
  typeButton: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.harborBlue,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    height: 36,
    maxWidth: 128,
    paddingHorizontal: 10,
  },
  typeButtonSelected: { backgroundColor: colors.harborBlue },
  typeButtonText: { color: colors.harborBlue, ...typography.label },
  typeButtonTextSelected: { color: colors.warmWhite },
  sortButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  sortButtonText: { color: colors.mistDark, ...typography.label },
  inlineError: {
    alignItems: "center",
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  inlineErrorText: { color: colors.destructive, flex: 1, ...typography.timestamp },
  dismiss: { color: colors.destructive, ...typography.label },
  list: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  documentRow: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  documentIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  documentCopy: { flex: 1, gap: 1, minWidth: 0 },
  documentTitle: { color: colors.graphite, ...typography.title },
  documentMeta: { color: colors.mistDark, ...typography.label },
  documentSummary: { color: colors.mistDark, ...typography.timestamp },
  status: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderColor: "rgba(48, 84, 96, 0.2)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    maxWidth: 96,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusReview: { backgroundColor: colors.sandWarm, borderColor: "rgba(228, 96, 24, 0.25)" },
  statusFailed: { backgroundColor: colors.destructiveBackground, borderColor: "rgba(192, 57, 43, 0.25)" },
  statusText: { color: colors.harborBlue, ...typography.label },
  statusReviewText: { color: colors.warmApricot },
  statusFailedText: { color: colors.destructive },
  filteredEmpty: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  filteredLoading: { marginTop: spacing.xl },
  filteredEmptyTitle: { color: colors.graphite, ...typography.title },
  filteredEmptyText: { color: colors.mistDark, textAlign: "center", ...typography.timestamp },
  pressed: { opacity: 0.76 },
  ambientBehind: { marginHorizontal: -spacing.md },
});
