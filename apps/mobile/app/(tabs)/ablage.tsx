import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  FileCheck2,
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
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  type FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

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
import { tap } from "@/src/lib/feedback";
import { createNote, triggerNoteAnalysis } from "@/src/lib/notes";
import {
  buildLibraryFilterExpression,
  filterLibraryDocuments,
  formatLibraryCount,
  getLibraryEntryGroup,
  buildLibraryJumpTargets,
  flattenLibraryGroups,
  getLibraryChunkRanges,
  getLibraryDocumentTypeOptions,
  getLibraryRowsThrough,
  libraryJumpSelect,
  libraryMaxRowsPerRequest,
  type LibraryJumpTarget,
  type LibraryListItem,
  libraryKindOptions,
  type LibraryKind,
  formatDocumentDate,
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
  loadLibraryDocumentIdsForPerson,
  loadLibraryDocumentPeople,
  mergeLibraryDocuments,
  subscribeToLibraryChanges,
  type LibraryDocument,
  type LibraryFilters,
  type LibrarySort,
  type LibraryStatusFilter,
} from "@/src/lib/library";
import { formatPeopleLine, type Person } from "@/src/lib/people";
import { getSupabase } from "@/src/lib/supabase";
import { fetchFamilyMembers, type FamilyMemberOption } from "@/src/lib/tasks";
import { contentEntering, stateEntering } from "@/src/theme/motion";
import { colors, fonts, radii, spacing, typography } from "@/src/theme/tokens";
import { getManualNotePreview } from "@ordilo/document-contract";

type CreateKind = "document" | "note" | "contact";
type LibraryFilterDraft = Omit<LibraryFilters, "query"> & { sort: LibrarySort };
/** Long enough for a word, short enough that results feel live. */
const SEARCH_DEBOUNCE_MS = 280;
/** A return visit after this long quietly re-reads what is on screen. */
const FOCUS_RELOAD_AFTER_MS = 30_000;
const VIEWABILITY = { itemVisiblePercentThreshold: 10 };

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
  const [appendFailed, setAppendFailed] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [createNoteType, setCreateNoteType] = useState<DocumentType | null>(null);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSources, setContactSources] = useState<Map<string, string>>(new Map());
  const [contactsReady, setContactsReady] = useState(false);
  const [contactsRefreshing, setContactsRefreshing] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [view, setView] = useState<LibraryKind>("all");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpTargets, setJumpTargets] = useState<LibraryJumpTarget[] | null>(null);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [jumpCurrent, setJumpCurrent] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  /** The keys the rows in `documents` were loaded for. */
  const [rowsFor, setRowsFor] = useState<{ base: string; query: string } | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  const [draftFilters, setDraftFilters] = useState<LibraryFilterDraft>({
    status: "all",
    documentType: "all",
    personId: "all",
    sort: "newest",
  });
  const requestGeneration = useRef(0);
  const jumpGeneration = useRef(0);
  const createSheetRef = useRef<OrdiloSheetHandle>(null);
  const pendingCreateRef = useRef<CreateKind | null>(null);
  const membersRef = useRef<FamilyMemberOption[]>([]);
  const chipScrollRef = useRef<ScrollView>(null);
  const chipFrames = useRef(new Map<LibraryKind, { x: number; width: number }>());
  const chipRow = useRef({ scrollX: 0, width: 0 });
  const reduceMotion = useReducedMotion();
  const listRef = useRef<FlatList<LibraryListItem>>(null);
  const listHeightRef = useRef(0);
  const listItemsRef = useRef<LibraryListItem[]>([]);
  const documentsRef = useRef<LibraryDocument[]>([]);
  const lastLoadRef = useRef<{ key: string; at: number } | null>(null);
  /** The page a running load-more asks for, so a reload does not drop it. */
  const appendingPageRef = useRef<number | null>(null);
  /** Row offset of a jump target that waits for its rows to load. */
  const pendingJumpRef = useRef<number | null>(null);
  const jumpRetryRef = useRef<{ offset: number; tries: number; timer: ReturnType<typeof setTimeout> | null }>({
    offset: -1,
    tries: 0,
    timer: null,
  });
  const visibleGroupRef = useRef<string | null>(null);
  const openJumpRef = useRef<(groupKey: string) => void>(() => undefined);

  // FlatList refuses a changing callback here, so it has no dependencies.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: LibraryListItem }[] }) => {
      const first = viewableItems[0]?.item;
      if (first) visibleGroupRef.current = first.groupKey;
    },
    [],
  );

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => () => {
    if (jumpRetryRef.current.timer) clearTimeout(jumpRetryRef.current.timer);
  }, []);

  // Search waits for a short pause: every keystroke would otherwise scan
  // titles, summaries and full texts on the server.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.query === searchInput ? current : { ...current, query: searchInput },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  /**
   * What the rows depend on beyond what the phone can filter itself. Rows
   * of another order, person or kind are never shown for this one.
   */
  const baseKey = `${family?.id ?? ""}|${view}|${sort}|${filters.personId}`;
  /** Identifies what the list shows, so a return visit can keep its pages. */
  const queryKey = `${baseKey}|${filters.status}|${filters.documentType}|${filters.query.trim()}`;

  /**
   * The library query for the current kind, filters and search. The list,
   * the review count and the month jump all read through it, so a jump
   * lands in the same result the list shows.
   */
  const buildDocumentsQuery = useCallback(
    (
      familyId: string,
      columns: string,
      personDocumentIds: string[] | null,
      {
        count = false,
        head = false,
        status = filters.status,
      }: { count?: boolean; head?: boolean; status?: LibraryStatusFilter } = {},
    ) => {
      // The explicit family predicate narrows the library to the resolved
      // family; RLS remains the authority for this anon-key client.
      let query = getSupabase()
        .from("documents")
        .select(columns, count || head ? { count: "exact", head } : undefined)
        .eq("family_id", familyId);
      // Notes are documents with source "manual". Zugänge are credentials
      // from either source, so the other two kinds leave them out.
      if (view === "notes") query = query.eq("source", "manual");
      if (view === "documents") query = query.neq("source", "manual");
      if (view === "credentials") query = query.eq("document_type", "credentials");
      if (status === "needs_review") query = query.eq("status", "analyzed");
      if (status === "confirmed") query = query.eq("status", "confirmed");
      if (status === "failed") query = query.eq("status", "failed");
      if (status === "processing") {
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
      return query;
    },
    [filters.documentType, filters.query, filters.status, view],
  );

  const loadDocuments = useCallback(
    async ({
      append = false,
      page = 0,
      quiet = false,
      refresh = false,
      through,
    }: {
      append?: boolean;
      page?: number;
      /** Refresh in place: no spinner, no error banner, pages and scroll kept. */
      quiet?: boolean;
      refresh?: boolean;
      /** Load rows 0…through-1 at once: a return visit or a jump target. */
      through?: number;
    } = {}) => {
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
        setDocuments([]);
        setHasMore(false);
        setTotalCount(null);
        setLoading(false);
        return;
      }
      const fresh = !append && !through && !quiet && !refresh;
      if (fresh) {
        pendingJumpRef.current = null;
        // Until this answer lands, no key counts as loaded: going back to
        // the previous search must load again, not keep these rows.
        lastLoadRef.current = null;
      }
      if (append) appendingPageRef.current = page;
      if (refresh) setRefreshing(true);
      else if (append || (through && !quiet)) setLoadingMore(true);
      else if (!quiet) setLoading(true);
      if (!append) setAppendFailed(false);
      if (!quiet) setError(null);
      try {
        const range = through
          ? { from: 0, to: through - 1 }
          : getLibraryPageRange(page);
        const expected = through ?? libraryPageSize;
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
            setRowsFor({ base: baseKey, query: queryKey });
            setPeople(new Map());
            setHasMore(false);
            setTotalCount(0);
            setReviewCount(0);
            setNextPage(0);
            lastLoadRef.current = { key: queryKey, at: Date.now() };
          }
          return;
        }
        // Only a load that starts at row 0 asks for totals, so the header
        // can say how much there is without every scroll step counting.
        const firstRows = !append;
        // A long jump reads more rows than one response may carry; the id
        // breaks ties so equal titles never swap places between ranges.
        const ranges = through ? getLibraryChunkRanges(through) : [range];
        const [listResults, reviewResult] = await Promise.all([
          Promise.all(
            ranges.map((chunk, index) =>
              buildDocumentsQuery(family.id, libraryDocumentSelect, personDocumentIds, {
                count: firstRows && index === 0,
              })
                .order(order.column, { ascending: order.ascending })
                .order("id", { ascending: true })
                .range(chunk.from, chunk.to),
            ),
          ),
          firstRows && filters.status === "all" && view !== "credentials"
            ? buildDocumentsQuery(family.id, "id", personDocumentIds, {
                head: true,
                status: "needs_review",
              })
            : Promise.resolve(null),
        ]);
        const failed = listResults.find((result) => result.error);
        if (failed?.error) throw failed.error;
        const next = listResults.flatMap(
          (result) => (result.data ?? []) as unknown as LibraryDocument[],
        );
        if (isCurrentRequest()) {
          setDocuments((current) =>
            append ? mergeLibraryDocuments(current, next) : next,
          );
          setRowsFor({ base: baseKey, query: queryKey });
          if (firstRows) {
            const counted = listResults[0]?.count;
            setTotalCount(typeof counted === "number" ? counted : null);
            setReviewCount(
              reviewResult && !reviewResult.error ? reviewResult.count ?? 0 : 0,
            );
          }
          const full = next.length === expected;
          setHasMore(full);
          const loadedPages = through ? through / libraryPageSize : page + 1;
          setNextPage(full ? loadedPages : loadedPages - 1);
          lastLoadRef.current = { key: queryKey, at: Date.now() };
          // Settled with the rows, not after the faces below: the list may
          // reach its end while faces load, and a still-busy flag would turn
          // that one onEndReached away for good.
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
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
              // Keep known faces while a refresh replaces the rows, so they
              // do not blink out and back in.
              const merged = fresh ? new Map<string, Person[]>() : new Map(current);
              for (const [id, list] of pagePeople) merged.set(id, list);
              return merged;
            });
          }
        }
      } catch {
        if (isCurrentRequest()) {
          if (through && !quiet) pendingJumpRef.current = null;
          if (append) setAppendFailed(true);
          else if (!quiet) {
            setError(
              "Deine Dokumente konnten nicht geladen werden. Bitte versuch es nochmal.",
            );
          }
        }
      } finally {
        if (append && appendingPageRef.current === page) appendingPageRef.current = null;
        if (isCurrentRequest()) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [baseKey, buildDocumentsQuery, family, filters.personId, filters.status, queryKey, sort, view],
  );

  /** Reloads everything already on screen, in place. */
  const reloadInPlace = useCallback(
    ({ refresh = false } = {}) => {
      // A page still on its way counts as loaded: the reload replaces that
      // request, so it has to bring those rows along.
      const appending = appendingPageRef.current;
      const loaded = Math.max(
        documentsRef.current.length,
        libraryPageSize,
        appending === null ? 0 : (appending + 1) * libraryPageSize,
      );
      void loadDocuments({
        quiet: !refresh,
        refresh,
        through: Math.ceil(loaded / libraryPageSize) * libraryPageSize,
      });
    },
    [loadDocuments],
  );

  // A return visit keeps the pages and the scroll position; only a changed
  // kind, filter, sort or search starts over at the top.
  useFocusEffect(useCallback(() => {
    const last = lastLoadRef.current;
    if (last && last.key === queryKey) {
      if (Date.now() - last.at > FOCUS_RELOAD_AFTER_MS) reloadInPlace();
      return;
    }
    void loadDocuments();
  }, [loadDocuments, queryKey, reloadInPlace]));

  useEffect(() => subscribeToLibraryChanges((change) => {
    if (view === "contacts") return;
    if (change.type === "remove") {
      if (!documentsRef.current.some((document) => document.id === change.documentId)) return;
      setDocuments((current) => current.filter((document) => document.id !== change.documentId));
      setTotalCount((current) => (current === null ? null : Math.max(0, current - 1)));
      return;
    }
    reloadInPlace();
  }), [reloadInPlace, view]);

  const loadContactRows = useCallback(async ({ refresh = false } = {}) => {
    if (!family) {
      setContacts([]);
      setContactsReady(true);
      return;
    }
    if (refresh) setContactsRefreshing(true);
    setContactsError(null);
    try {
      const rows = await loadContacts(family.id);
      const sourceIds = rows
        .map((contact) => contact.source_document_id)
        .filter((id): id is string => Boolean(id));
      // Awaited so the "Aus …" line lands with its row. Arriving later it
      // would grow every row by a line under the reader's eyes.
      const sources = await loadContactSourceTitles(sourceIds).catch(
        () => new Map<string, string>(),
      );
      setContactSources(sources);
      setContacts(rows);
    } catch {
      setContactsError(
        "Deine Kontakte konnten nicht geladen werden. Bitte versuch es nochmal.",
      );
    } finally {
      setContactsReady(true);
      setContactsRefreshing(false);
    }
  }, [family]);

  // Contacts load with every visit, not only on their chip: the search
  // in "Alle" finds them too, and new ones found in letters are announced.
  // After the first read this is a silent refresh.
  useFocusEffect(useCallback(() => {
    void loadContactRows();
  }, [loadContactRows]));

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void loadDocuments({ append: true, page: nextPage });
  }, [hasMore, loadDocuments, loading, loadingMore, nextPage]);

  /** Scroll-driven loading stops after a failed page until the user asks. */
  const autoLoadMore = useCallback(() => {
    if (view === "contacts" || appendFailed) return;
    loadMore();
  }, [appendFailed, loadMore, view]);

  const retryLoadMore = useCallback(() => {
    setAppendFailed(false);
    loadMore();
  }, [loadMore]);

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

  const openFilterSheet = useCallback(() => {
    setDraftFilters({
      status: filters.status,
      documentType: filters.documentType,
      personId: filters.personId,
      sort,
    });
    setFilterSheetOpen(true);
  }, [filters.documentType, filters.personId, filters.status, sort]);

  const applyFilters = useCallback(() => {
    setFilters((current) => ({
      ...current,
      status: draftFilters.status,
      documentType: draftFilters.documentType,
      personId: draftFilters.personId,
    }));
    setSort(draftFilters.sort);
    setFilterSheetOpen(false);
  }, [draftFilters]);

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
  const settingsCount = activeFilterCount + Number(sort !== "newest");

  // The server's answer for exactly this search is final. Until it
  // arrives, the rows already here narrow down on the phone, so typing
  // feels instant; rows of another order or person are not reused.
  const rowsCurrent = rowsFor?.query === queryKey;
  const rowsReusable = rowsFor?.base === baseKey;
  const visibleDocuments = useMemo(
    () =>
      rowsCurrent
        ? documents
        : rowsReusable
          ? filterLibraryDocuments(documents, filters)
          : [],
    [documents, filters, rowsCurrent, rowsReusable],
  );
  const groups = useMemo(
    () => groupLibraryDocuments(visibleDocuments, sort),
    [visibleDocuments, sort],
  );
  const matchingContacts = useMemo(
    () => (view === "all" && searching ? filterContacts(contacts, filters.query) : []),
    [contacts, filters.query, searching, view],
  );

  const subtitle = useMemo(() => {
    if (view === "contacts") {
      if (!contactsReady) return "Kontakte werden geladen";
      if (searching) {
        return formatLibraryCount("contacts", filterContacts(contacts, filters.query).length, { filtered: true });
      }
      if (confirmedContacts.length === 0) return EMPTY_SUBTITLE.contacts;
      return formatLibraryCount("contacts", confirmedContacts.length);
    }
    if (loading && documents.length === 0) return "Wird geladen";
    if (documents.length === 0 && !hasActiveFilters) return EMPTY_SUBTITLE[view];
    return formatLibraryCount(
      view,
      (totalCount ?? documents.length) + (searching ? matchingContacts.length : 0),
      { filtered: hasActiveFilters, more: totalCount === null && hasMore },
    );
  }, [
    confirmedContacts.length,
    contacts,
    contactsReady,
    documents.length,
    filters.query,
    hasActiveFilters,
    hasMore,
    loading,
    matchingContacts.length,
    searching,
    totalCount,
    view,
  ]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filters.status !== "all") {
      chips.push({
        key: "status",
        label: libraryStatusFilters.find((option) => option.value === filters.status)?.label ?? "Status",
        clear: () => setFilters((current) => ({ ...current, status: "all" })),
      });
    }
    if (filters.documentType !== "all") {
      chips.push({
        key: "type",
        label: documentTypeLabels[filters.documentType],
        clear: () => setFilters((current) => ({ ...current, documentType: "all" })),
      });
    }
    if (filters.personId !== "all") {
      chips.push({
        key: "person",
        label: members.find((member) => member.id === filters.personId)?.name ?? "Person",
        clear: () => setFilters((current) => ({ ...current, personId: "all" })),
      });
    }
    if (sort !== "newest") {
      chips.push({
        key: "sort",
        label: librarySortOptions.find((option) => option.value === sort)?.label ?? "Sortierung",
        clear: () => setSort("newest"),
      });
    }
    return chips;
  }, [filters.documentType, filters.personId, filters.status, members, sort]);

  const switchView = useCallback((nextView: LibraryKind) => {
    if (nextView === view) return;
    // Invalidate the previous query before replacing the visible list. A
    // slow "Alle" response must never populate the Notizen list. The search
    // stays: looking for the same thing under another chip is the point.
    requestGeneration.current += 1;
    pendingJumpRef.current = null;
    visibleGroupRef.current = null;
    lastLoadRef.current = null;
    if (nextView !== "contacts") {
      setDocuments([]);
      setRowsFor(null);
      setError(null);
      setHasMore(false);
      setTotalCount(null);
      setReviewCount(0);
      setLoading(true);
      setNextPage(1);
      setFilters((current) => ({ ...current, documentType: "all" }));
    }
    setView(nextView);
  }, [view]);

  /**
   * A half-visible chip slides fully into view once chosen, so the
   * selection is never cut off at the edge. Native scroll, no worklet.
   */
  const revealChip = useCallback((kind: LibraryKind) => {
    const frame = chipFrames.current.get(kind);
    const { scrollX, width } = chipRow.current;
    if (!frame || width === 0) return;
    // The chip row bleeds to the screen edges; keep the page margin clear.
    const inset = spacing.md;
    let target: number | null = null;
    if (frame.x + frame.width > scrollX + width - inset) {
      target = frame.x + frame.width - width + inset;
    } else if (frame.x < scrollX + inset) {
      target = frame.x - inset;
    }
    if (target === null) return;
    chipScrollRef.current?.scrollTo({ animated: !reduceMotion, x: Math.max(0, target) });
  }, [reduceMotion]);

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
      reloadInPlace();
      router.push(`/note/${result.document_id}`);
    },
    [family, reloadInPlace, router],
  );

  const showSkeleton =
    view !== "contacts" &&
    ((loading && documents.length === 0 && !hasActiveFilters) ||
      // A new order or person: the old rows would only jump around.
      (loading && documents.length > 0 && !rowsReusable) ||
      // "Alle" waits for the first contacts read too: the "neue Kontakte"
      // row then arrives with the list instead of shoving it down.
      (view === "all" && !contactsReady));
  const { items: listItems, stickyIndices } = useMemo(
    () =>
      !showSkeleton && view !== "contacts"
        ? flattenLibraryGroups(groups)
        : { items: [] as LibraryListItem[], stickyIndices: [] as number[] },
    [groups, showSkeleton, view],
  );

  const stickyCells = useMemo(() => stickyIndices.map((index) => index + 1), [stickyIndices]);

  useEffect(() => {
    listItemsRef.current = listItems;
  }, [listItems]);

  /** The header of the group holding a row offset, if that row is loaded. */
  const findGroupIndex = useCallback((items: LibraryListItem[], offset: number) => {
    let found = -1;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.type !== "header") continue;
      if (item.offset > offset) break;
      found = index;
    }
    return found;
  }, []);

  const scrollToOffset = useCallback((offset: number) => {
    const items = listItemsRef.current;
    const rowCount = items.reduce((count, item) => count + Number(item.type === "row"), 0);
    if (rowCount <= offset) return false;
    const index = findGroupIndex(items, offset);
    if (index < 0) return false;
    jumpRetryRef.current.offset = offset;
    jumpRetryRef.current.tries = 0;
    listRef.current?.scrollToIndex({ animated: !reduceMotion, index });
    return true;
  }, [findGroupIndex, reduceMotion]);

  // A jump into a month that was not loaded yet waits for its rows, then
  // lands; if the rows arrive without it, the jump is dropped rather than
  // firing later into some other result.
  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (pending === null || loadingMore) return;
    pendingJumpRef.current = null;
    scrollToOffset(pending);
  }, [listItems, loadingMore, scrollToOffset]);

  const openJump = useCallback((groupKey: string) => {
    if (!family) return;
    const requestId = jumpGeneration.current + 1;
    jumpGeneration.current = requestId;
    setJumpCurrent(groupKey);
    setJumpTargets(null);
    setJumpFailed(false);
    setJumpOpen(true);
    void (async () => {
      try {
        const personDocumentIds =
          filters.personId === "all"
            ? null
            : await loadLibraryDocumentIdsForPerson(family.id, filters.personId);
        let targets: LibraryJumpTarget[] = [];
        if (personDocumentIds?.length !== 0) {
          const order = getLibrarySortOrder(sort);
          type JumpRow = Pick<LibraryDocument, "created_at" | "original_filename" | "title">;
          const rows: JumpRow[] = [];
          // Three small columns per row, read a response at a time until
          // the library ends, so even years of paperwork index fully.
          for (let from = 0; ; from += libraryMaxRowsPerRequest) {
            const { data, error: jumpError } = await buildDocumentsQuery(
              family.id,
              libraryJumpSelect,
              personDocumentIds,
            )
              .order(order.column, { ascending: order.ascending })
              .order("id", { ascending: true })
              .range(from, from + libraryMaxRowsPerRequest - 1);
            if (jumpError) throw jumpError;
            const page = (data ?? []) as unknown as JumpRow[];
            rows.push(...page);
            if (page.length < libraryMaxRowsPerRequest) break;
          }
          targets = buildLibraryJumpTargets(rows, sort);
        }
        if (jumpGeneration.current === requestId) setJumpTargets(targets);
      } catch {
        if (jumpGeneration.current === requestId) setJumpFailed(true);
      }
    })();
  }, [buildDocumentsQuery, family, filters.personId, sort]);

  useEffect(() => {
    openJumpRef.current = openJump;
  }, [openJump]);

  const chooseJump = useCallback((target: LibraryJumpTarget) => {
    setJumpOpen(false);
    if (scrollToOffset(target.offset)) return;
    pendingJumpRef.current = target.offset;
    void loadDocuments({ through: getLibraryRowsThrough(target.offset) });
  }, [loadDocuments, scrollToOffset]);

  const openDocument = useCallback((document: LibraryDocument) => {
    router.push(
      isManualNote(document) ? `/note/${document.id}` : `/document/${document.id}`,
    );
  }, [router]);

  const pressGroupHeader = useCallback((groupKey: string) => {
    tap();
    openJumpRef.current(groupKey);
  }, []);

  const renderListItem = useCallback(
    ({ item }: { item: LibraryListItem }) =>
      item.type === "header" ? (
        <GroupHeader
          groupKey={item.groupKey}
          label={item.label}
          letters={sort === "title"}
          onPress={pressGroupHeader}
        />
      ) : (
        <DocumentCell
          document={item.document}
          first={item.first}
          last={item.last}
          onOpen={openDocument}
          people={people.get(item.document.id)}
        />
      ),
    [openDocument, people, pressGroupHeader, sort],
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
    searchInput !== "" ||
    documents.length > 0 ||
    contacts.length > 0 ||
    view !== "all";
  const showDocumentControls =
    view !== "contacts" && (documents.length > 0 || hasActiveFilters);
  // What needs a hand sits above the list, counted by the server so the
  // number is true for the whole library, not only the loaded pages.
  const showReviewRow =
    (view === "all" || view === "documents") &&
    !searching &&
    filters.status === "all" &&
    reviewCount > 0;
  const showContactsRow = view === "all" && !searching && suggestedContacts.length > 0;
  const searchPending = searchInput.trim() !== filters.query.trim();

  return (
    <Screen>
      <AmbientFields style={styles.ambientBehind} />
      <Animated.FlatList
        ListFooterComponent={
          listItems.length === 0 ? null : appendFailed ? (
            <View style={styles.listEnd}>
              <Text style={styles.listEndText}>Weitere konnten nicht geladen werden.</Text>
              <OrdiloButton onPress={retryLoadMore} title="Nochmal versuchen" variant="ghost" />
            </View>
          ) : hasMore ? (
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
            <Text style={styles.listEndText}>Das war alles.</Text>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
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
                busy={searchPending || (loading && hasActiveFilters)}
                onChangeText={setSearchInput}
                onClear={() => {
                  setSearchInput("");
                  setFilters((current) => ({ ...current, query: "" }));
                }}
                onOpenSettings={view === "contacts" ? undefined : openFilterSheet}
                placeholder={SEARCH_PLACEHOLDER[view]}
                settingsCount={settingsCount}
                value={searchInput}
              />
            ) : null}

            <ScrollView
              accessibilityRole="tablist"
              contentContainerStyle={styles.chips}
              horizontal
              onLayout={({ nativeEvent }) => {
                chipRow.current.width = nativeEvent.layout.width;
              }}
              onScroll={({ nativeEvent }) => {
                chipRow.current.scrollX = nativeEvent.contentOffset.x;
              }}
              ref={chipScrollRef}
              scrollEventThrottle={64}
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
            >
              {libraryKindOptions.map((option) => (
                <View
                  key={option.value}
                  onLayout={({ nativeEvent }) =>
                    chipFrames.current.set(option.value, {
                      x: nativeEvent.layout.x,
                      width: nativeEvent.layout.width,
                    })
                  }
                >
                  <Chip
                    icon={KIND_ICON[option.value]}
                    label={option.label}
                    onPress={() => {
                      switchView(option.value);
                      revealChip(option.value);
                    }}
                    role="tab"
                    selected={view === option.value}
                  />
                </View>
              ))}
            </ScrollView>

            {view !== "contacts" && activeFilterChips.length > 0 ? (
              <View style={styles.activeFilters}>
                {activeFilterChips.map((chip) => (
                  <Chip
                    accessibilityLabel={`Filter ${chip.label} entfernen`}
                    key={chip.key}
                    label={chip.label}
                    onPress={chip.clear}
                    removable
                  />
                ))}
              </View>
            ) : null}

            <Animated.View
              entering={stateEntering()}
              key={view}
              style={styles.viewContent}
            >
            {view === "contacts" ? (
              <ContactsView
                contacts={contacts}
                error={contactsError}
                loading={!contactsReady}
                onCreate={() => setCreateContactOpen(true)}
                onOpen={(contactId) => router.push(`/contacts/${contactId}`)}
                onOpenSource={(documentId) =>
                  router.push(`/document/${documentId}`)
                }
                onResetSearch={() => {
                  setSearchInput("");
                  setFilters((current) => ({ ...current, query: "" }));
                }}
                onRetry={() => void loadContactRows()}
                query={filters.query}
                sourceTitles={contactSources}
              />
            ) : showSkeleton ? (
              <ListSkeleton rows={6} />
            ) : showDocumentControls ? (
              <View style={styles.resultsContent}>
                {showReviewRow || showContactsRow ? (
                  <Animated.View entering={contentEntering()}>
                    <ListGroup>
                      {showReviewRow ? (
                        <ListRow
                          accessibilityHint="Zeigt nur die Dokumente, die du noch prüfen solltest"
                          chevron
                          first
                          leading={
                            <IconTile tint={colors.harborTint}>
                              <FileCheck2 color={colors.harborBlue} size={20} strokeWidth={1.9} />
                            </IconTile>
                          }
                          onPress={() => setFilters((current) => ({ ...current, status: "needs_review" }))}
                          subtitle="Kurz drüberschauen, dann sind sie abgelegt."
                          title={
                            reviewCount === 1
                              ? "1 Dokument wartet auf dich"
                              : `${reviewCount} Dokumente warten auf dich`
                          }
                        />
                      ) : null}
                      {showContactsRow ? (
                        <ListRow
                          accessibilityHint="Zeigt die Kontakte, die Ordilo in euren Dokumenten gefunden hat"
                          chevron
                          first={!showReviewRow}
                          leading={
                            <IconTile tint={colors.harborTint}>
                              <UserPlus color={colors.harborBlue} size={20} strokeWidth={1.9} />
                            </IconTile>
                          }
                          onPress={() => {
                            switchView("contacts");
                            revealChip("contacts");
                          }}
                          subtitle="Aus euren Dokumenten. Kurz prüfen?"
                          title={
                            suggestedContacts.length === 1
                              ? "1 neuer Kontakt gefunden"
                              : `${suggestedContacts.length} neue Kontakte gefunden`
                          }
                        />
                      ) : null}
                    </ListGroup>
                  </Animated.View>
                ) : null}

                {error ? (
                  <InlineNotice
                    actionLabel="Erneut versuchen"
                    message={error}
                    onAction={() => reloadInPlace({ refresh: true })}
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
                    {matchingContacts.length > 3 ? (
                      <OrdiloButton
                        onPress={() => {
                          switchView("contacts");
                          revealChip("contacts");
                        }}
                        title={`Alle ${matchingContacts.length} Kontakte zeigen`}
                        variant="ghost"
                      />
                    ) : null}
                  </View>
                ) : null}

                {visibleDocuments.length > 0 || matchingContacts.length > 0 ? null : loading ? (
                  // While a new search or filter is on its way, the old page
                  // must not flash "Nichts gefunden" under the new words.
                  <ActivityIndicator
                    accessibilityLabel="Dokumente werden geladen"
                    color={colors.harborBlue}
                    style={styles.filteredLoading}
                  />
                ) : (
                  <FilteredEmptyState
                    activeFilterCount={activeFilterCount}
                    query={filters.query}
                    onLoadMore={hasMore ? retryLoadMore : undefined}
                    onReset={() => {
                      setSearchInput("");
                      setFilters(NO_FILTERS);
                    }}
                  />
                )}
              </View>
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
          </View>
        }
        contentContainerStyle={styles.content}
        data={listItems}
        initialNumToRender={14}
        keyExtractor={(item) => item.key}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={14}
        onContentSizeChange={(_width, height) => {
          // A first page shorter than the screen never reaches its end, so
          // onEndReached would wait forever: keep filling until it scrolls.
          if (height < listHeightRef.current) autoLoadMore();
        }}
        onEndReached={autoLoadMore}
        onEndReachedThreshold={1.5}
        onLayout={({ nativeEvent }) => {
          listHeightRef.current = nativeEvent.layout.height;
        }}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          // A header below the rendered window has no measured position
          // yet: estimate, let it render, then land precisely. The retry
          // looks the header up again, because the rows may have changed.
          const retry = jumpRetryRef.current;
          if (retry.offset < 0 || retry.tries >= 2) return;
          retry.tries += 1;
          listRef.current?.scrollToOffset({
            animated: false,
            offset: averageItemLength * index,
          });
          if (retry.timer) clearTimeout(retry.timer);
          retry.timer = setTimeout(() => {
            retry.timer = null;
            const again = findGroupIndex(listItemsRef.current, retry.offset);
            if (again >= 0 && again < listItemsRef.current.length) {
              listRef.current?.scrollToIndex({ animated: false, index: again });
            }
          }, 80);
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        ref={listRef}
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() => {
              void loadContactRows({ refresh: true });
              if (view !== "contacts") reloadInPlace({ refresh: true });
            }}
            refreshing={
              view === "contacts" ? contactsRefreshing : refreshing
            }
            tintColor={colors.harborBlue}
          />
        }
        renderItem={renderListItem}
        showsVerticalScrollIndicator={false}
        // Sticky indices count the list header as cell 0.
        stickyHeaderIndices={stickyCells}
        viewabilityConfig={VIEWABILITY}
        windowSize={11}
      />

      <OrdiloPickerSheet
        accessibilityLabel={sort === "title" ? "Zu einem Buchstaben springen" : "Zu einem Monat springen"}
        onClose={() => setJumpOpen(false)}
        options={
          jumpFailed
            ? [{
                key: "retry",
                label: "Nicht geladen. Nochmal versuchen",
                onPress: () => openJump(jumpCurrent ?? ""),
              }]
            : jumpTargets === null
              ? [{ disabled: true, key: "loading", label: "Wird geladen …", onPress: () => undefined }]
              : jumpTargets.map((target) => ({
                  accessibilityLabel: `${target.label}, ${formatLibraryCount("all", target.count)}`,
                  hint: formatLibraryCount("all", target.count),
                  key: target.groupKey,
                  label: target.label,
                  onPress: () => chooseJump(target),
                  selected: target.groupKey === jumpCurrent,
                }))
        }
        title={sort === "title" ? "Zu welchem Buchstaben?" : "Zu welchem Monat?"}
        visible={jumpOpen}
      />

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
            sort: "newest",
          })
        }
        onPersonChange={(personId) =>
          setDraftFilters((current) => ({ ...current, personId }))
        }
        onSortChange={(nextSort) =>
          setDraftFilters((current) => ({ ...current, sort: nextSort }))
        }
        onStatusChange={(status) =>
          setDraftFilters((current) => ({ ...current, status }))
        }
        personId={draftFilters.personId}
        documentTypeOptions={getLibraryDocumentTypeOptions(view)}
        sort={draftFilters.sort}
        status={draftFilters.status}
        visible={filterSheetOpen}
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

/**
 * The sticky month (or letter) above a group. Only the pill takes
 * touches: stuck at the top it floats over the rows, and the rest of its
 * strip must not swallow their taps.
 */
const GroupHeader = memo(function GroupHeader({
  groupKey,
  label,
  letters,
  onPress,
}: {
  groupKey: string;
  label: string;
  letters: boolean;
  onPress: (groupKey: string) => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.stickyHeader}>
      <Pressable
        accessibilityHint={letters ? "Zeigt alle Buchstaben zum Springen" : "Zeigt alle Monate zum Springen"}
        accessibilityLabel={label}
        accessibilityRole="button"
        hitSlop={{ bottom: 8, left: 4, right: 12, top: 8 }}
        onPress={() => onPress(groupKey)}
        style={({ pressed }) => [styles.stickyPill, pressed && styles.stickyPressed]}
      >
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.stickyLabel}>
          {label}
        </Text>
        <ChevronDown color={colors.mistDark} size={13} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
});

const NO_PEOPLE: Person[] = [];

/**
 * One row of a group card. The card is spread over many list cells: each
 * cell draws its own side borders, the first and last close it.
 */
const DocumentCell = memo(function DocumentCell({
  document,
  first,
  last,
  onOpen,
  people,
}: {
  document: LibraryDocument;
  first: boolean;
  last: boolean;
  onOpen: (document: LibraryDocument) => void;
  people: Person[] | undefined;
}) {
  return (
    <View style={[styles.cell, first && styles.cellFirst, last && styles.cellLast]}>
      <DocumentRow
        document={document}
        first={first}
        onPress={() => onOpen(document)}
        people={people ?? NO_PEOPLE}
      />
    </View>
  );
});

/**
 * The one search field of the library: quiet, 44pt, clears in one tap.
 * Its trailing button opens filter and sort, with a count badge while
 * anything but the defaults is set, so the settings live where the
 * question is asked instead of in a second toolbar.
 */
function SearchField({
  accessibilityLabel,
  busy,
  onChangeText,
  onClear,
  onOpenSettings,
  placeholder,
  settingsCount,
  value,
}: {
  accessibilityLabel: string;
  busy: boolean;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onOpenSettings?: () => void;
  placeholder: string;
  settingsCount: number;
  value: string;
}) {
  return (
    <View style={styles.search}>
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="Suche läuft"
          color={colors.mistDark}
          size="small"
          style={styles.searchIcon}
        />
      ) : (
        <Search color={colors.mistDark} size={18} strokeWidth={2} style={styles.searchIcon} />
      )}
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
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
          onPress={onClear}
          style={styles.searchClear}
        >
          <X color={colors.mistDark} size={14} strokeWidth={2.4} />
        </Pressable>
      ) : null}
      {onOpenSettings ? (
        <>
          <View style={styles.searchDivider} />
          <Pressable
            accessibilityHint="Öffnet Filter und Sortierung"
            accessibilityLabel={
              settingsCount > 0
                ? `Filter und Sortierung, ${settingsCount} aktiv`
                : "Filter und Sortierung"
            }
            accessibilityRole="button"
            onPress={() => {
              tap();
              onOpenSettings();
            }}
            style={({ pressed }) => [styles.searchSettings, pressed && styles.searchSettingsPressed]}
          >
            <SlidersHorizontal
              color={settingsCount > 0 ? colors.harborBlue : colors.mistDark}
              size={18}
              strokeWidth={2}
            />
            {settingsCount > 0 ? (
              <View style={styles.settingsBadge}>
                <Text maxFontSizeMultiplier={1.2} style={styles.settingsBadgeText}>
                  {settingsCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </>
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
  documentTypeOptions,
  members,
  onApply,
  onClose,
  onDocumentTypeChange,
  onPersonChange,
  onReset,
  onSortChange,
  onStatusChange,
  personId,
  sort,
  status,
  visible,
}: {
  documentType: DocumentType | "all";
  /** Types that can match under the current kind; none hides the field. */
  documentTypeOptions: DocumentType[];
  members: FamilyMemberOption[];
  onApply: () => void;
  onClose: () => void;
  onDocumentTypeChange: (documentType: DocumentType | "all") => void;
  onPersonChange: (personId: string | "all") => void;
  onReset: () => void;
  onSortChange: (sort: LibrarySort) => void;
  onStatusChange: (status: LibraryFilters["status"]) => void;
  personId: string | "all";
  sort: LibrarySort;
  status: LibraryFilters["status"];
  visible: boolean;
}) {
  const [picker, setPicker] = useState<
    "sort" | "status" | "documentType" | "person" | null
  >(null);
  const sortLabel =
    librarySortOptions.find((option) => option.value === sort)?.label ??
    "Neueste zuerst";
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
      subtitle="Was du sehen möchtest, und in welcher Reihenfolge."
      title="Filter und Sortierung"
      visible={visible}
    >
      <OrdiloFormBody contentContainerStyle={styles.filterSheetBody}>
        <OrdiloFormField label="Sortierung">
          <OrdiloFormSelect
            accessibilityHint="Öffnet die Auswahl der Reihenfolge"
            accessibilityLabel={`Sortierung: ${sortLabel}`}
            onPress={() => setPicker("sort")}
            trailing={<ChevronDown color={colors.mist} size={18} />}
            value={sortLabel}
          />
        </OrdiloFormField>
        <OrdiloFormField label="Status">
          <OrdiloFormSelect
            accessibilityHint="Öffnet die Statusauswahl"
            accessibilityLabel={`Status: ${statusLabel}`}
            onPress={() => setPicker("status")}
            trailing={<ChevronDown color={colors.mist} size={18} />}
            value={statusLabel}
          />
        </OrdiloFormField>
        {documentTypeOptions.length > 0 ? (
          <OrdiloFormField label="Dokumentart">
            <OrdiloFormSelect
              accessibilityHint="Öffnet die Auswahl der Dokumentart"
              accessibilityLabel={`Dokumentart: ${documentTypeLabel}`}
              onPress={() => setPicker("documentType")}
              trailing={<ChevronDown color={colors.mist} size={18} />}
              value={documentTypeLabel}
            />
          </OrdiloFormField>
        ) : null}
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
          options={librarySortOptions.map((option) => ({
            key: option.value,
            label: option.label,
            onPress: () => {
              onSortChange(option.value);
              setPicker(null);
            },
            selected: sort === option.value,
          }))}
          title="Sortierung"
          visible={picker === "sort"}
        />
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
            ...documentTypeOptions.map((value) => {
              const label = documentTypeLabels[value];
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

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: MOBILE_DOCK_CONTENT_INSET },
  listHeader: { gap: spacing.md, paddingBottom: spacing.xs },
  // No band behind the month: a full-width opaque strip would cut through
  // the ambient fields. The pill alone stays legible over passing rows.
  stickyHeader: {
    alignItems: "flex-start",
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
  },
  stickyPill: {
    alignItems: "center",
    backgroundColor: "rgba(253, 252, 250, 0.96)",
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  stickyPressed: { backgroundColor: colors.sandWarm },
  stickyLabel: { color: colors.mistDark, ...typography.caption },
  // One group card spread over many list cells: each cell draws its own
  // side borders, the first and last close the card with its radius.
  cell: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: "hidden",
  },
  cellFirst: {
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderTopWidth: 1,
  },
  cellLast: {
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
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
  searchIcon: { width: 20 },
  searchInput: {
    color: colors.graphite,
    flex: 1,
    minHeight: 44,
    ...typography.body,
  },
  searchDivider: {
    alignSelf: "stretch",
    backgroundColor: colors.mistLight,
    marginVertical: 10,
    width: StyleSheet.hairlineWidth,
  },
  searchSettings: {
    alignItems: "center",
    borderRadius: radii.base,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  searchSettingsPressed: { backgroundColor: colors.sandWarm },
  settingsBadge: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: colors.sand,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 3,
    position: "absolute",
    right: 5,
    top: 5,
  },
  settingsBadgeText: { color: colors.warmWhite, fontFamily: fonts.semibold, fontSize: 10, lineHeight: 12 },
  searchClear: {
    alignItems: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  activeFilters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  resultsContent: { gap: spacing.md },
  viewContent: { gap: spacing.md },
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
