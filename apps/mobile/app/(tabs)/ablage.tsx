import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  FileText,
  FolderOpen,
  NotebookPen,
  Plus,
  Search,
  SlidersHorizontal,
  ArrowDownAZ,
  Sparkles,
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
import { NoteFormSheet } from "@/src/components/note-form-sheet";
import { OrdiloSheet, useSheetPresentation } from "@/src/components/sheet";
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  const [view, setView] = useState<"documents" | "notes">("documents");
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

  const loadDocuments = useCallback(
    async ({ append = false, page = 0, refresh = false } = {}) => {
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
    if (change.type === "remove") {
      setDocuments((current) => current.filter((document) => document.id !== change.documentId));
      return;
    }
    void loadDocuments({ refresh: true });
  }), [loadDocuments]);

  const reloadDocuments = useCallback(() => {
    void loadDocuments({ refresh: true });
  }, [loadDocuments]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    void loadDocuments({ append: true, page: nextPage });
  }, [hasMore, loadDocuments, loadingMore, nextPage]);

  const chooseSort = useCallback((nextSort: LibrarySort) => {
    setSort(nextSort);
    setSortPickerOpen(false);
  }, []);

  const sortedLabel = useMemo(
    () => librarySortOptions.find((option) => option.value === sort)?.label ?? "Neueste zuerst",
    [sort],
  );

  const documentCountLabel = useMemo(() => {
    if (view === "notes") {
      if (documents.length === 1) return "1 Notiz der Familie";
      return `${documents.length}${hasMore ? "+" : ""} Notizen der Familie`;
    }
    if (documents.length === 1) return "1 Dokument der Familie";
    return `${documents.length}${hasMore ? "+" : ""} Dokumente der Familie`;
  }, [documents.length, hasMore, view]);

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

  const switchView = useCallback((nextView: "documents" | "notes") => {
    if (nextView === view) return;
    tap();
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
  }, [view]);

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

  if (error && documents.length === 0 && !hasActiveFilters) {
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
            onRefresh={reloadDocuments}
            refreshing={refreshing}
            tintColor={colors.harborBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          action={{
            accessibilityLabel: "Mehr in der Ablage",
            icon: Ellipsis,
            onPress: () => setToolsOpen(true),
          }}
          subtitle={
            loading && documents.length === 0
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
          ]}
        />

        {view === "notes" ? (
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
      <LibraryToolsSheet
        onClose={() => setToolsOpen(false)}
        onCreateNote={() => {
          setToolsOpen(false);
          setCreateNoteOpen(true);
        }}
        onOpenContacts={() => {
          setToolsOpen(false);
          router.push("/contacts");
        }}
        onOpenSearch={() => {
          setToolsOpen(false);
          router.push("/suche");
        }}
        onOpenCollections={() => {
          setToolsOpen(false);
          router.push("/sammlungen");
        }}
        visible={toolsOpen}
      />
      <NoteFormSheet
        onClose={() => setCreateNoteOpen(false)}
        onSubmit={createNewNote}
        visible={createNoteOpen}
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
        description="Halte Familienwissen fest, bevor es wieder jemand im Kopf behalten muss."
      >
        <OrdiloButton
          icon={<Plus color={colors.warmWhite} size={19} />}
          onPress={onCreate}
          size="lg"
          title="Notiz schreiben"
        />
      </EmptyState>
    );
  }

  return (
    <>
      <OrdiloButton
        icon={<Plus color={colors.warmWhite} size={17} />}
        onPress={onCreate}
        title="Notiz schreiben"
      />
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
      <View style={styles.documentIcon}><NotebookPen color={colors.mistDark} size={20} strokeWidth={1.7} /></View>
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

function LibraryToolsSheet({
  onClose,
  onCreateNote,
  onOpenCollections,
  onOpenContacts,
  onOpenSearch,
  visible,
}: {
  onClose: () => void;
  onCreateNote: () => void;
  onOpenCollections: () => void;
  onOpenContacts: () => void;
  onOpenSearch: () => void;
  visible: boolean;
}) {
  const sheetRef = useSheetPresentation(visible);
  return (
    <OrdiloSheet
      accessibilityLabel="Mehr in der Ablage"
      onDismiss={onClose}
      ref={sheetRef}
    >
      <LibraryToolOption
        description="Familienwissen direkt festhalten"
        icon={NotebookPen}
        label="Notiz anlegen"
        onPress={onCreateNote}
      />
      <Text style={styles.sheetTitle}>Mehr in der Ablage</Text>
      <LibraryToolOption
        description="Frag Ordilo zu euren Dokumenten."
        icon={Sparkles}
        label="Ordilo fragen"
        onPress={onOpenSearch}
      />
      <LibraryToolOption
        description="Adressen und wichtige Personen."
        icon={Users}
        label="Kontakte"
        onPress={onOpenContacts}
      />
      <LibraryToolOption
        description="Dokumente gemeinsam sortieren."
        icon={FolderOpen}
        label="Sammlungen"
        onPress={onOpenCollections}
      />
    </OrdiloSheet>
  );
}

function LibraryToolOption({
  description,
  icon: Icon,
  label,
  onPress,
}: {
  description: string;
  icon: typeof Sparkles;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.toolOption, pressed && styles.pressed]}
    >
      <View style={styles.toolIcon}>
        <Icon color={colors.harborBlue} size={19} strokeWidth={1.8} />
      </View>
      <View style={styles.toolCopy}>
        <Text style={styles.toolLabel}>{label}</Text>
        <Text style={styles.toolDescription}>{description}</Text>
      </View>
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
  const sheetRef = useSheetPresentation(visible);
  return (
    <OrdiloSheet
      accessibilityLabel="Dokumentart auswählen"
      onDismiss={onClose}
      ref={sheetRef}
    >
      <Text style={styles.sheetTitle}>Dokumentart</Text>
      <TypeOption
        label="Alle Arten"
        onPress={() => onSelect("all")}
        selected={selected === "all"}
      />
      {documentTypes.map(([value, label]) => (
        <TypeOption
          key={value}
          label={label}
          onPress={() => onSelect(value)}
          selected={selected === value}
        />
      ))}
    </OrdiloSheet>
  );
}

function TypeOption({
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
      style={({ pressed }) => [styles.typeOption, pressed && styles.pressed]}
    >
      <Text style={[styles.typeOptionText, selected && styles.typeOptionTextSelected]}>
        {label}
      </Text>
      {selected ? <CheckCircle2 color={colors.harborBlue} size={19} /> : null}
    </Pressable>
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
  const sheetRef = useSheetPresentation(visible);
  return (
    <OrdiloSheet
      accessibilityLabel="Sortierung auswählen"
      onDismiss={onClose}
      ref={sheetRef}
    >
      <Text style={styles.sheetTitle}>Sortieren</Text>
      {librarySortOptions.map((option) => (
        <TypeOption
          key={option.value}
          label={option.label}
          onPress={() => onSelect(option.value)}
          selected={selected === option.value}
        />
      ))}
    </OrdiloSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { gap: spacing.md, paddingBottom: spacing["2xl"] },
  noteDate: { color: colors.mistDark, ...typography.label },
  notesLoading: { marginTop: spacing["2xl"] },
  toolOption: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.sm,
  },
  toolIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.sm,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  toolCopy: { flex: 1, gap: 1 },
  toolLabel: { color: colors.graphite, ...typography.title },
  toolDescription: { color: colors.mistDark, ...typography.timestamp },
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
  sheetTitle: { color: colors.graphite, marginBottom: spacing.sm, ...typography.display },
  typeOption: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: spacing.xs,
  },
  typeOptionText: { color: colors.graphite, ...typography.body },
  typeOptionTextSelected: { color: colors.harborBlue, fontFamily: typography.title.fontFamily },
});
