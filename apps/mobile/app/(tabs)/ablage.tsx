import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileText,
  Search,
  SlidersHorizontal,
  ArrowDownAZ,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import {
  documentTypeLabels,
  type DocumentType,
} from "@/src/lib/document-review";
import { useFamily } from "@/src/lib/family-context";
import {
  filterLibraryDocuments,
  formatDocumentDate,
  getDocumentStatusLabel,
  getDocumentTitle,
  getDocumentTypeLabel,
  getLibraryPageRange,
  getLibrarySortOrder,
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
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [filters, setFilters] = useState<LibraryFilters>({
    query: "",
    status: "all",
    documentType: "all",
  });

  const loadDocuments = useCallback(
    async ({ append = false, page = 0, refresh = false } = {}) => {
      if (!family) {
        setDocuments([]);
        setHasMore(false);
        setLoading(false);
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
        const { data, error: queryError } = await getSupabase()
          .from("documents")
          .select(libraryDocumentSelect)
          .eq("family_id", family.id)
          .order(order.column, { ascending: order.ascending })
          .range(range.from, range.to);
        if (queryError) throw queryError;
        const next = (data ?? []) as LibraryDocument[];
        setDocuments((current) => append ? mergeLibraryDocuments(current, next) : next);
        setHasMore(next.length === libraryPageSize);
        setNextPage(next.length === libraryPageSize ? page + 1 : page);
      } catch {
        setError(
          "Deine Dokumente konnten nicht geladen werden. Bitte versuch es nochmal.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [family, sort],
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
    if (documents.length === 1) return "1 Dokument der Familie";
    return `${documents.length}${hasMore ? "+" : ""} Dokumente der Familie`;
  }, [documents.length, hasMore]);

  const visibleDocuments = useMemo(
    () => filterLibraryDocuments(documents, filters),
    [documents, filters],
  );
  const activeFilterCount =
    Number(filters.status !== "all") + Number(filters.documentType !== "all");
  const selectedTypeLabel =
    filters.documentType === "all"
      ? "Art"
      : documentTypeLabels[filters.documentType];

  if (loading && documents.length === 0) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator accessibilityLabel="Dokumente werden geladen" color={colors.harborBlue} />
      </Screen>
    );
  }

  if (error && documents.length === 0) {
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
          subtitle={documentCountLabel}
          title="Ablage"
        />

        {documents.length > 0 ? (
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

            {visibleDocuments.length > 0 ? (
              <>
                <View style={styles.list}>
                  {visibleDocuments.map((document) => (
                    <DocumentRow
                      document={document}
                      key={document.id}
                      onPress={() => router.push(`/document/${document.id}`)}
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
    </Screen>
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
    <Pressable
      accessibilityHint="Öffnet die Dokumentansicht"
      accessibilityLabel={`${getDocumentTitle(document)}, ${getDocumentStatusLabel(document.status)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]}
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
    </Pressable>
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
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.typeSheet}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Dokumentart</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
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
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.typeSheet}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Sortieren</Text>
          {librarySortOptions.map((option) => (
            <TypeOption
              key={option.value}
              label={option.label}
              onPress={() => onSelect(option.value)}
              selected={selected === option.value}
            />
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { gap: spacing.md, paddingBottom: spacing["2xl"] },
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
  filteredEmptyTitle: { color: colors.graphite, ...typography.title },
  filteredEmptyText: { color: colors.mistDark, textAlign: "center", ...typography.timestamp },
  pressed: { opacity: 0.76 },
  modalOverlay: { backgroundColor: "rgba(38, 36, 33, 0.28)", flex: 1, justifyContent: "flex-end" },
  typeSheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "78%",
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    width: 40,
  },
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
