"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { Sparkles, MessageCircle, X, Loader2 } from "lucide-react";
import { AISearchBar } from "@/components/ordilo/ai-search-bar";
import { SourceCard } from "@/components/ordilo/source-card";
import { cn } from "@/lib/utils";
import type { ChatSource } from "@/lib/schemas/chat";
import type { DocumentType } from "@/lib/schemas/extraction";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Metadata for a confirmed document, used for filter chips and source card
 * filtering.
 */
export interface DocumentMetadata {
  id: string;
  title: string | null;
  category: string | null;
  document_type: string | null;
  persons: string[];
}

/**
 * Props for the SucheClient component.
 */
export interface SucheClientProps {
  familyId: string;
  familyName: string;
  members: Array<{ id: string; name: string }>;
  documents: DocumentMetadata[];
}

/**
 * A single chat message in the conversation.
 */
interface ChatMessage {
  /** Unique ID for React keys. */
  id: string;
  /** "user" for user messages, "ai" for AI answers. */
  role: "user" | "ai";
  /** The message text (user query or AI answer). */
  content: string;
  /** Sources cited by the AI (only for AI messages). */
  sources?: ChatSource[];
  /** Whether this message had an error (AI error message). */
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The four example queries shown in the empty state (VAL-SEARCH-021).
 * Clicking an example populates the shared search bar so the user can
 * review/edit the query before submitting (VAL-SEARCH-032 non-blocking).
 */
const EXAMPLE_QUERIES = [
  "Zeig mir alle Dokumente von Emma",
  "Welche Fristen laufen bald ab?",
  "Finde die letzte Stromrechnung",
  "Was muss ich diese Woche erledigen?",
] as const;

/**
 * Filter types for the filter chips.
 */
type FilterType = "person" | "category" | "document_type";

/**
 * An active filter.
 */
interface ActiveFilter {
  type: FilterType;
  value: string;
  /** German label displayed on the chip. */
  label: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Search / Chat client component.
 *
 * The /suche page uses the AI search bar as the entry point for both search
 * and chat (VAL-CHAT-028). Submitting a natural-language query triggers the
 * chat flow (combined search + LLM synthesis via /api/chat), and results are
 * presented as a chat answer with source cards.
 *
 * Features:
 * - AI search bar (pill-shaped with sparkle icon) — Enter and button submit
 * - Empty state with 4 example queries (clicking submits them)
 * - Chat interface: user message bubbles + AI answer bubbles
 * - Source cards under AI answers (clickable → navigates to document)
 * - Chat history preserved during session
 * - Auto-scroll to latest message
 * - Loading indicator while awaiting response
 * - Filter chips (by person, category, document type) with clear
 * - German throughout, no internal terminology leaks
 *
 * @see VAL-SEARCH-020..034, VAL-CHAT-020..034, VAL-CROSS-011..012
 */
export function SucheClient({
  familyId,
  members,
  documents,
}: SucheClientProps) {
  const router = useRouter();

  // --- Chat state ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // --- Filter state ---
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // --- Search bar value (controlled) ---
  // Owned by SucheClient so that example/suggested queries can populate the
  // shared search bar for review/edit before submission, rather than
  // submitting directly (VAL-SEARCH-032 non-blocking).
  const [searchBarValue, setSearchBarValue] = useState("");

  // --- Auto-scroll ref ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Current result set (VAL-SEARCH-032)
  // -------------------------------------------------------------------------

  /**
   * The document IDs of the current result set — the sources cited by the
   * most recent AI message. When the latest query returned no sources (e.g.
   * "Ich finde dazu kein Dokument."), there is no current result set and
   * filter chips must not render.
   *
   * Person chips are derived strictly from these result documents, not the
   * full family/confirmed-document set, so no unrelated chips appear.
   */
  const currentResultDocIds = useMemo(() => {
    const lastAiMessage = [...messages]
      .reverse()
      .find((m) => m.role === "ai");
    return new Set(lastAiMessage?.sources?.map((s) => s.document_id) ?? []);
  }, [messages]);

  const hasResults = currentResultDocIds.size > 0;

  // -------------------------------------------------------------------------
  // Filter chips computation (VAL-SEARCH-032)
  // -------------------------------------------------------------------------

  /**
   * Compute available filter facets from the CURRENT result set, not the
   * full family/confirmed-document set.
   *
   * - Person chips: family members linked to at least one document in the
   *   current result set (via the documents[].persons array).
   * - Category chips: distinct non-null categories from the result
   *   documents.
   * - Document type chips: distinct non-null document types from the result
   *   documents, labeled in German.
   *
   * No empty chips are produced (null/blank category and document_type
   * values are skipped). Chips only render after a result set exists (see
   * `hasResults` / `hasFacets` in the render section).
   */
  const facets = useMemo(() => {
    const personsInResults = new Set<string>();
    const categories = new Set<string>();
    const docTypes = new Set<string>();

    for (const doc of documents) {
      if (!currentResultDocIds.has(doc.id)) continue;
      for (const person of doc.persons) {
        if (person.trim()) personsInResults.add(person);
      }
      if (doc.category?.trim()) {
        categories.add(doc.category.trim());
      }
      if (doc.document_type?.trim()) {
        docTypes.add(doc.document_type.trim());
      }
    }

    // Person chips: only members that appear in the current result set.
    const personChips = members
      .filter((m) => personsInResults.has(m.name))
      .map((m) => ({ value: m.name, label: m.name }));

    const categoryChips = [...categories]
      .sort()
      .map((c) => ({ value: c, label: c }));

    const docTypeChips = [...docTypes]
      .sort()
      .map((dt) => ({
        value: dt,
        label: DOCUMENT_TYPE_LABELS[dt as DocumentType] ?? dt,
      }));

    return { personChips, categoryChips, docTypeChips };
  }, [members, documents, currentResultDocIds]);

  // -------------------------------------------------------------------------
  // Source card filtering (VAL-SEARCH-028..031)
  // -------------------------------------------------------------------------

  /**
   * Check if a document (by ID) passes all active filters.
   */
  const passesFilters = useCallback(
    (docId: string): boolean => {
      if (activeFilters.length === 0) return true;

      const doc = documents.find((d) => d.id === docId);
      if (!doc) return false;

      return activeFilters.every((filter) => {
        if (filter.type === "person") {
          return doc.persons.some(
            (p) => p.toLowerCase() === filter.value.toLowerCase(),
          );
        }
        if (filter.type === "category") {
          return (
            doc.category?.toLowerCase() === filter.value.toLowerCase()
          );
        }
        if (filter.type === "document_type") {
          return (
            doc.document_type?.toLowerCase() === filter.value.toLowerCase()
          );
        }
        return true;
      });
    },
    [activeFilters, documents],
  );

  // -------------------------------------------------------------------------
  // Filter chip toggle
  // -------------------------------------------------------------------------

  const toggleFilter = useCallback(
    (type: FilterType, value: string, label: string) => {
      setActiveFilters((prev) => {
        const existing = prev.find(
          (f) => f.type === type && f.value === value,
        );
        if (existing) {
          // Toggle off → remove the filter (VAL-SEARCH-031).
          return prev.filter(
            (f) => !(f.type === type && f.value === value),
          );
        }
        // Toggle on → add the filter. Remove any other filter of the same
        // type (only one filter per type active at a time for clarity).
        return [
          ...prev.filter((f) => f.type !== type),
          { type, value, label },
        ];
      });
    },
    [],
  );

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
  }, []);

  // -------------------------------------------------------------------------
  // Auto-scroll to latest message (VAL-CHAT-022)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages, isLoading]);

  // -------------------------------------------------------------------------
  // Submit handler — calls /api/chat and updates the conversation
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!query.trim() || isLoading) return;

      // Add the user message immediately.
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: query,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query, family_id: familyId }),
        });

        const data = await response.json();

        if (!response.ok) {
          // Friendly German error message (VAL-CHAT-011, no stack trace).
          const aiMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "ai",
            content:
              "Die Suche ist leider fehlgeschlagen. Bitte versuche es erneut.",
            isError: true,
          };
          setMessages((prev) => [...prev, aiMessage]);
          return;
        }

        // Add the AI answer with sources.
        const aiMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "ai",
          content: data.answer,
          sources: data.sources ?? [],
        };
        setMessages((prev) => [...prev, aiMessage]);
      } catch {
        // Network error → friendly German message.
        const aiMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "ai",
          content:
            "Die Suche ist leider fehlgeschlagen. Bitte versuche es erneut.",
          isError: true,
        };
        setMessages((prev) => [...prev, aiMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [familyId, isLoading],
  );

  // -------------------------------------------------------------------------
  // Source card click handler (VAL-SEARCH-027)
  // -------------------------------------------------------------------------

  const handleSourceCardClick = useCallback(
    (documentId: string) => {
      router.push(`/scan?doc=${documentId}`);
    },
    [router],
  );

  // -------------------------------------------------------------------------
  // Example query click handler (VAL-SEARCH-021, VAL-SEARCH-032 non-blocking)
  // -------------------------------------------------------------------------

  /**
   * Populate the shared search bar with an example/suggested query so the
   * user can review and edit it before submitting, rather than submitting
   * directly. The query is visible and editable; the user presses Enter or
   * the send button to run it.
   */
  const handleExampleClick = useCallback((query: string) => {
    setSearchBarValue(query);
    // Focus the search bar so the user can immediately edit/submit.
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Such- und Chat-Eingabe"]',
    );
    textarea?.focus();
  }, []);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const hasMessages = messages.length > 0;
  const hasFacets =
    hasResults &&
    (facets.personChips.length > 0 ||
      facets.categoryChips.length > 0 ||
      facets.docTypeChips.length > 0);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 140px)" }}>
      {/* Filter chips — only rendered after a result set exists and at
          least one facet is available (VAL-SEARCH-032). No chips render
          before any results exist, and chips are derived from the current
          result set so no empty or unrelated chips appear. */}
      {hasFacets && (
        <FilterChips
          facets={facets}
          activeFilters={activeFilters}
          onToggle={toggleFilter}
          onClearAll={clearAllFilters}
        />
      )}

      {/* Chat conversation area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        aria-live="polite"
        aria-label="Konversation"
      >
        {!hasMessages && !isLoading ? (
          /* Empty state (VAL-SEARCH-021, VAL-DESIGN-002) */
          <EmptyState onExampleClick={handleExampleClick} />
        ) : (
          <div className="space-y-4 py-2">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                passesFilters={passesFilters}
                onSourceCardClick={handleSourceCardClick}
              />
            ))}

            {/* Loading indicator (VAL-CHAT-025) */}
            {isLoading && (
              <div
                data-testid="chat-loading-indicator"
                className="flex items-start gap-2"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]">
                  <Sparkles
                    className="size-4 text-white"
                    aria-hidden="true"
                  />
                </div>
                <div className="rounded-ordilo-md rounded-tl-sm bg-card px-4 py-3 shadow-card">
                  <div className="flex items-center gap-2">
                    <Loader2
                      className="size-4 animate-spin text-[var(--petrol)]"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-muted-foreground">
                      Ordilo denkt nach…
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Auto-scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* AI search bar — fixed at the bottom of the content area.
          Controlled by SucheClient so example/suggested queries can populate
          the bar without submitting (VAL-SEARCH-032 non-blocking). */}
      <div className="sticky bottom-0 bg-background/95 pt-3 backdrop-blur-sm">
        <AISearchBar
          value={searchBarValue}
          onValueChange={setSearchBarValue}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          placeholder="Frage Ordilo oder suche nach Dokumenten…"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Empty state for the search page (VAL-SEARCH-021, VAL-DESIGN-002).
 *
 * Shows a warm welcome message and four clickable example queries.
 * Clicking an example populates the shared search bar (so the query is
 * visible and editable before running) rather than submitting directly
 * (VAL-SEARCH-032 non-blocking).
 */
function EmptyState({
  onExampleClick,
}: {
  onExampleClick: (query: string) => void;
}) {
  return (
    <div
      data-testid="suche-empty-state"
      className="flex flex-col items-center px-2 py-8 text-center"
    >
      {/* Warm illustration area */}
      <div
        className="mb-5 flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <MessageCircle
          className="size-9"
          style={{ color: "var(--petrol)" }}
          strokeWidth={1.5}
        />
      </div>

      {/* Welcome heading */}
      <h2 className="text-xl font-semibold text-foreground">
        Was möchtest du finden?
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Frag Ordilo alles über deine Dokumente. Hier sind ein paar Ideen:
      </p>

      {/* Example queries */}
      <div className="mt-6 w-full space-y-2.5">
        {EXAMPLE_QUERIES.map((query) => (
          <button
            key={query}
            type="button"
            onClick={() => onExampleClick(query)}
            data-testid="example-query"
            className="flex w-full items-center gap-3 rounded-ordilo-md border border-border bg-card px-4 py-3 text-left shadow-card transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Sparkles
              className="size-4 shrink-0"
              style={{ color: "var(--petrol)" }}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground">{query}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A single message bubble (user or AI) with optional source cards.
 */
function MessageBubble({
  message,
  passesFilters,
  onSourceCardClick,
}: {
  message: ChatMessage;
  passesFilters: (docId: string) => boolean;
  onSourceCardClick: (docId: string) => void;
}) {
  const isUser = message.role === "user";

  // Filter source cards by active filters (VAL-SEARCH-028..031).
  const visibleSources = message.sources?.filter((s) =>
    passesFilters(s.document_id),
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-ordilo-md rounded-tr-sm bg-[var(--petrol)] px-4 py-3 text-white shadow-card">
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-start gap-2">
        {/* AI avatar */}
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]">
          <Sparkles className="size-4 text-white" aria-hidden="true" />
        </div>

        {/* AI answer bubble */}
        <div
          className={cn(
            "max-w-[85%] rounded-ordilo-md rounded-tl-sm bg-card px-4 py-3 shadow-card",
            message.isError && "border border-destructive/30",
          )}
        >
          <p
            className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap",
              message.isError
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {message.content}
          </p>
        </div>
      </div>

      {/* Source cards under the AI answer (VAL-CHAT-023) */}
      {visibleSources && visibleSources.length > 0 && (
        <div className="ml-10 w-[calc(100%-40px)] space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Quellen</p>
          {visibleSources.map((source) => (
            <SourceCard
              key={source.document_id}
              documentId={source.document_id}
              title={source.title}
              excerpt={source.excerpt}
              score={source.score}
              onClick={() => onSourceCardClick(source.document_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Filter chips for person, category, and document type (VAL-SEARCH-028..032).
 */
function FilterChips({
  facets,
  activeFilters,
  onToggle,
  onClearAll,
}: {
  facets: {
    personChips: Array<{ value: string; label: string }>;
    categoryChips: Array<{ value: string; label: string }>;
    docTypeChips: Array<{ value: string; label: string }>;
  };
  activeFilters: ActiveFilter[];
  onToggle: (type: FilterType, value: string, label: string) => void;
  onClearAll: () => void;
}) {
  const isActive = (type: FilterType, value: string) =>
    activeFilters.some((f) => f.type === type && f.value === value);

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div
      data-testid="filter-chips"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-3"
    >
      {/* Person chips */}
      {facets.personChips.map((chip) => (
        <FilterChip
          key={`person-${chip.value}`}
          label={chip.label}
          active={isActive("person", chip.value)}
          onClick={() => onToggle("person", chip.value, chip.label)}
        />
      ))}

      {/* Category chips */}
      {facets.categoryChips.map((chip) => (
        <FilterChip
          key={`category-${chip.value}`}
          label={chip.label}
          active={isActive("category", chip.value)}
          onClick={() => onToggle("category", chip.value, chip.label)}
        />
      ))}

      {/* Document type chips */}
      {facets.docTypeChips.map((chip) => (
        <FilterChip
          key={`doctype-${chip.value}`}
          label={chip.label}
          active={isActive("document_type", chip.value)}
          onClick={() => onToggle("document_type", chip.value, chip.label)}
        />
      ))}

      {/* Clear all button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Filter zurücksetzen"
        >
          <X className="size-3" aria-hidden="true" />
          Zurücksetzen
        </button>
      )}
    </div>
  );
}

/**
 * A single filter chip (toggle button).
 */
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {active && <X className="size-3" aria-hidden="true" />}
      {label}
    </button>
  );
}
