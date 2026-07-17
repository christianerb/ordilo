"use client";

import {
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, MessageSquare, Trash2, ChevronDown } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { useActiveSearch } from "@/lib/search/active-search-context";
import { useDocumentViewer } from "@/lib/scan/scan-context";
import type { ChatSource, AnswerCard as AnswerCardData } from "@/lib/schemas/chat";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { MessageBubble, type ChatMessage } from "./message-bubble";
import {
  FilterChips,
  type FilterType,
  type ActiveFilter,
} from "./filter-chips";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentMetadata {
  id: string;
  title: string | null;
  category: string | null;
  document_type: string | null;
  persons: string[];
}

export interface InitialMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  card?: AnswerCardData;
  feedback?: "positive" | "negative" | null;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

export interface SucheClientProps {
  familyId: string;
  familyName: string;
  members: Array<{ id: string; name: string }>;
  documents: DocumentMetadata[];
  initialQuery?: string;
  conversationId?: string;
  initialMessages?: InitialMessage[];
  conversations?: ConversationSummary[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_QUERIES = [
  "Zeig mir alle Dokumente von Emma",
  "Welche Fristen laufen bald ab?",
  "Finde die letzte Stromrechnung",
  "Was muss ich diese Woche erledigen?",
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SucheClient({
  familyId,
  members,
  documents,
  initialQuery = "",
  initialMessages = [],
  conversationId: initialConversationId = "",
  conversations: initialConversations = [],
}: SucheClientProps) {
  const router = useRouter();
  const { openDocument } = useDocumentViewer();

  // --- Chat state (plain fetch + NDJSON stream, no AI SDK client) ---
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      card: m.card,
      feedback: m.feedback ?? null,
    })),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [showChatList, setShowChatList] = useState(false);

  // --- Filter state ---
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // --- Auto-scroll ref ---
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Current result set (latest assistant message sources)
  // -------------------------------------------------------------------------

  const currentResultDocIds = useMemo(() => {
    const lastAi = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    return new Set(lastAi?.sources?.map((s) => s.document_id) ?? []);
  }, [messages]);

  const hasResults = currentResultDocIds.size > 0;

  // -------------------------------------------------------------------------
  // Filter chip computation
  // -------------------------------------------------------------------------

  const facets = useMemo(() => {
    const personsInResults = new Set<string>();
    const categories = new Set<string>();
    const docTypes = new Set<string>();

    for (const doc of documents) {
      if (!currentResultDocIds.has(doc.id)) continue;
      for (const person of doc.persons) {
        if (person.trim()) personsInResults.add(person);
      }
      if (doc.category?.trim()) categories.add(doc.category.trim());
      if (doc.document_type?.trim()) docTypes.add(doc.document_type.trim());
    }

    const personChips = members
      .filter((m) => personsInResults.has(m.name))
      .map((m) => ({ value: m.name, label: m.name }));

    const categoryChips = [...categories].sort().map((c) => ({
      value: c,
      label: c,
    }));

    const docTypeChips = [...docTypes].sort().map((dt) => ({
      value: dt,
      label: DOCUMENT_TYPE_LABELS[dt as keyof typeof DOCUMENT_TYPE_LABELS] ?? dt,
    }));

    return { personChips, categoryChips, docTypeChips };
  }, [members, documents, currentResultDocIds]);

  // -------------------------------------------------------------------------
  // Stale filter reconciliation — derived inline (Rule 1: derive state)
  // -------------------------------------------------------------------------
  const effectiveFilters = useMemo(() => {
    if (activeFilters.length === 0) return activeFilters;
    const validKeys = new Set<string>();
    for (const chip of facets.personChips) {
      validKeys.add(`person::${chip.value.toLowerCase()}`);
    }
    for (const chip of facets.categoryChips) {
      validKeys.add(`category::${chip.value.toLowerCase()}`);
    }
    for (const chip of facets.docTypeChips) {
      validKeys.add(`document_type::${chip.value.toLowerCase()}`);
    }
    return activeFilters.filter((f) =>
      validKeys.has(`${f.type}::${f.value.toLowerCase()}`),
    );
  }, [activeFilters, facets]);

  // -------------------------------------------------------------------------
  // Source card filtering
  // -------------------------------------------------------------------------

  const passesFilters = useCallback(
    (docId: string): boolean => {
      if (effectiveFilters.length === 0) return true;
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return false;
      return effectiveFilters.every((filter) => {
        if (filter.type === "person") {
          return doc.persons.some(
            (p) => p.toLowerCase() === filter.value.toLowerCase(),
          );
        }
        if (filter.type === "category") {
          return doc.category?.toLowerCase() === filter.value.toLowerCase();
        }
        if (filter.type === "document_type") {
          return (
            doc.document_type?.toLowerCase() === filter.value.toLowerCase()
          );
        }
        return true;
      });
    },
    [effectiveFilters, documents],
  );

  const toggleFilter = useCallback(
    (type: FilterType, value: string, label: string) => {
      setActiveFilters((prev) => {
        const existing = prev.find(
          (f) => f.type === type && f.value === value,
        );
        if (existing) {
          return prev.filter((f) => !(f.type === type && f.value === value));
        }
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
  // Conversation management
  // -------------------------------------------------------------------------

  const handleNewChat = useCallback(() => {
    setShowChatList(false);
    // Reset chat state so the empty state shows immediately
    setMessages([]);
    setActiveConversationId("");
    setError(false);
    setRateLimitError(false);
    setStreamingId(null);
    setActiveFilters([]);
    // Clear the URL so the server also knows we're on a new chat
    if (window.location.search.includes("chat=")) {
      router.push("/suche");
    }
  }, [router]);

  const handleSelectChat = useCallback((chatId: string) => {
    setShowChatList(false);
    router.push(`/suche?chat=${chatId}`);
  }, [router]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    try {
      await fetch(`/api/conversations/${chatId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== chatId));
      // If we deleted the active conversation, go to new chat
      if (chatId === activeConversationId) {
        router.push("/suche");
      }
    } catch {
      // Silent fail — user can retry
    }
  }, [activeConversationId, router]);

  // -------------------------------------------------------------------------
  // Auto-scroll — ResizeObserver on the messages container (Rule 4: DOM
  // integration). Observes DOM size changes directly instead of syncing
  // with React state via dependency arrays.
  // -------------------------------------------------------------------------
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll: observe the messages container for size changes (new
  // messages, streaming text) and scroll to the bottom. Re-connect when
  // the container appears (after the first message, when the Empty State
  // is replaced by the messages list).
  const scrollObserverRef = useRef<ResizeObserver | null>(null);
  useMountEffect(() => {
    const connect = () => {
      const container = messagesContainerRef.current;
      if (!container) return;

      // Disconnect any previous observer
      scrollObserverRef.current?.disconnect();

      const observer = new ResizeObserver(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
      observer.observe(container);
      scrollObserverRef.current = observer;

      // Also scroll immediately when connecting
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    };

    // Check periodically for the container to appear (when messages list
    // replaces the empty state). Once connected, the ResizeObserver handles
    // subsequent changes.
    const interval = window.setInterval(() => {
      if (messagesContainerRef.current) {
        connect();
        window.clearInterval(interval);
      }
    }, 100);

    return () => {
      window.clearInterval(interval);
      scrollObserverRef.current?.disconnect();
    };
  });

  // -------------------------------------------------------------------------
  // Submit handler — streaming fetch to /api/chat (NDJSON)
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!query.trim() || isLoading) return;

      setError(false);
      setRateLimitError(false);
      setIsLoading(true);

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: query,
        sources: [],
      };

      const aiMsgId = `ai-${Date.now()}`;
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        role: "assistant",
        content: "",
        sources: [],
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setStreamingId(aiMsgId);

      // Build history from messages before this query.
      // Include source context so the model knows which documents were
      // found in previous turns — enables follow-up questions like
      // "Welche davon hat Fristen?" without re-searching.
      const history = messages.map((m) => {
        const entry: { role: string; content: string } = {
          role: m.role,
          content: m.content,
        };
        if (m.role === "assistant" && m.sources && m.sources.length > 0) {
          entry.content = `${m.content}\n\n[Gefundene Dokumente: ${m.sources.map((s) => s.title ?? s.document_id).join(", ")}]`;
        }
        return entry;
      });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            family_id: familyId,
            history,
            conversation_id: activeConversationId || undefined,
          }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            setRateLimitError(true);
          } else {
            setError(true);
          }
          setStreamingId(null);
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === "text") {
                accumulatedText += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? { ...m, content: accumulatedText }
                      : m,
                  ),
                );
              } else if (data.type === "card") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, card: data.card } : m,
                  ),
                );
              } else if (data.type === "sources") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? { ...m, sources: data.sources as ChatSource[] }
                      : m,
                  ),
                );
              } else if (data.type === "confirmation_request") {
                // A destructive tool (mark_task_done) needs user
                // confirmation. The model will also ask in its text, but
                // this event lets the client render a confirmation UI.
                // For now, we rely on the model's text response to ask
                // for confirmation. The event is available for future
                // UI enhancement (e.g. inline confirm buttons).
              } else if (data.type === "conversation") {
                // Conversation ID from the server — update URL and state
                const newId = data.conversation_id as string;
                if (newId && newId !== activeConversationId) {
                  setActiveConversationId(newId);
                  // Update URL without full reload
                  const url = new URL(window.location.href);
                  url.searchParams.set("chat", newId);
                  window.history.replaceState({}, "", url.toString());
                  // Add to conversation list if new
                  if (!conversations.find((c) => c.id === newId)) {
                    setConversations((prev) => [
                      { id: newId, title: query.substring(0, 50) + (query.length > 50 ? "…" : ""), updated_at: new Date().toISOString() },
                      ...prev,
                    ]);
                  }
                }
              } else if (data.type === "error") {
                setError(true);
              }
            } catch {
              // Ignore partial/unparseable lines.
            }
          }
        }
      } catch {
        setError(true);
      } finally {
        setStreamingId(null);
        setIsLoading(false);
      }
    },
    [familyId, isLoading, messages, activeConversationId, conversations],
  );

  // -------------------------------------------------------------------------
  // Register the live submit handler with the global topbar (VAL-NAV): a
  // query typed into the topbar from anywhere lands in THIS conversation
  // instead of navigating away and losing thread continuity. Plain ref
  // write during render (Rule 4/5: mirrors handleSubmitRef below), cleared
  // on unmount so the topbar falls back to redirect-based search.
  // -------------------------------------------------------------------------
  const { setActiveHandler } = useActiveSearch();
  setActiveHandler(handleSubmit);
  useMountEffect(() => () => setActiveHandler(null));

  // -------------------------------------------------------------------------
  // Auto-submit initial query (Rule 4: mount-only external sync)
  // -------------------------------------------------------------------------
  const initialQuerySubmitted = useRef(false);
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;
  useMountEffect(() => {
    if (initialQuery && !initialQuerySubmitted.current) {
      initialQuerySubmitted.current = true;
      void handleSubmitRef.current(initialQuery);
    }
  });

  // -------------------------------------------------------------------------
  // Source card click — open the shared document detail sheet in place
  // -------------------------------------------------------------------------

  const handleSourceCardClick = useCallback(
    (documentId: string) => {
      void openDocument(documentId);
    },
    [openDocument],
  );

  // -------------------------------------------------------------------------
  // Example query click — submits straight away. The search bar itself now
  // lives outside this component (the global bottom composer, uniform
  // across every route — VAL-NAV), so there's no local input left to
  // animate a "typing" preview into.
  // -------------------------------------------------------------------------

  const handleExampleClick = useCallback(
    (query: string) => {
      void handleSubmit(query);
    },
    [handleSubmit],
  );

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
    <div className="relative flex h-[calc(100dvh-184px)] flex-col overflow-hidden rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)] p-3 lg:h-[calc(100dvh-152px)] lg:p-4">
      {/* Chat header bar — dropdown trigger + new chat */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setShowChatList(!showChatList)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-ordilo-sm px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Chat-Historie öffnen"
          data-testid="chat-history-toggle"
        >
          <MessageSquare
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate text-muted-foreground">
            {conversations.find((c) => c.id === activeConversationId)?.title || "Neuer Chat"}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              showChatList && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={handleNewChat}
          className="flex shrink-0 items-center gap-1.5 rounded-ordilo-sm px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Neuer Chat"
          data-testid="new-chat-button"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Neu</span>
        </button>
      </div>

      {/* Chat history dropdown — floating panel */}
      {showChatList && (
        <div
          className="absolute left-2 right-2 top-10 z-50 rounded-ordilo-sm border border-border/60 bg-background shadow-lg animate-in fade-in-0 slide-in-from-top-1"
          data-testid="chat-list-dropdown"
        >
          {/* Click-outside overlay */}
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setShowChatList(false)}
          />
          <ChatList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={handleSelectChat}
            onDelete={handleDeleteChat}
          />
        </div>
      )}

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {hasFacets && (
          <FilterChips
            facets={facets}
            activeFilters={activeFilters}
            onToggle={toggleFilter}
            onClearAll={clearAllFilters}
          />
        )}

        <div
          className="flex-1 overflow-y-auto"
          aria-live="polite"
          aria-label="Konversation"
        >
          {!hasMessages && !isLoading ? (
            <EmptyState onExampleClick={handleExampleClick} />
          ) : (
            <div ref={messagesContainerRef} className="space-y-4 py-2">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={message.id === streamingId}
                  passesFilters={passesFilters}
                  onSourceCardClick={handleSourceCardClick}
                />
              ))}

              {error && (
                <div className="flex flex-col items-start gap-2 animate-message-in">
                  <div className="flex items-start gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]">
                      <Sparkles
                        className="size-4 text-white"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="max-w-[85%] rounded-ordilo-md rounded-tl-sm border border-destructive/30 bg-card px-4 py-3 shadow-card lg:max-w-full animate-error-shake">
                      <p className="text-sm leading-relaxed text-destructive">
                        Da ist was schiefgegangen. Bitte frag nochmal.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {rateLimitError && (
                <div className="flex flex-col items-start gap-2 animate-message-in">
                  <div className="flex items-start gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]">
                      <Sparkles
                        className="size-4 text-white"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="max-w-[85%] rounded-ordilo-md rounded-tl-sm border border-border bg-card px-4 py-3 shadow-card lg:max-w-full">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Du hast heute viele Fragen gestellt. Das Tageslimit ist erreicht — bitte morgen weiter.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatList component — grouped, premium sidebar
// ---------------------------------------------------------------------------

function groupConversationsByDate(
  conversations: ConversationSummary[],
): { label: string; items: ConversationSummary[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: "Heute", items: [] },
    { label: "Gestern", items: [] },
    { label: "Diese Woche", items: [] },
    { label: "Früher", items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    if (d >= todayStart) {
      groups[0].items.push(conv);
    } else if (d >= yesterdayStart) {
      groups[1].items.push(conv);
    } else if (d >= weekStart) {
      groups[2].items.push(conv);
    } else {
      groups[3].items.push(conv);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

function ChatList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const groups = groupConversationsByDate(conversations);

  return (
    <div className="flex max-h-[400px] flex-col overflow-y-auto p-1.5">
      {groups.length === 0 ? (
        <p className="px-2.5 py-4 text-xs text-muted-foreground">
          Noch keine Chats.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-col">
                {group.items.map((conv) => {
                  const isActive = conv.id === activeId;
                  return (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-ordilo-sm px-2 py-1.5 transition-colors cursor-pointer",
                        isActive
                          ? "bg-secondary/50"
                          : "hover:bg-secondary/20",
                      )}
                      onClick={() => onSelect(conv.id)}
                      data-testid={`chat-list-item-${conv.id}`}
                    >
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          isActive
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {conv.title || "Neuer Chat"}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/20 opacity-0 transition-all hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Chat löschen"
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      <div
        className="mb-5 flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <OrdiloMascot
          size={44}
          mood="searching"
          style={{ color: "var(--petrol)" }}
        />
      </div>

      <h2 className="text-lg font-semibold text-foreground">
        Wie kann ich dir helfen?
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Frag Ordilo alles über deine Dokumente. Hier sind ein paar Ideen:
      </p>

      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 stagger-children lg:grid-cols-2">
        {EXAMPLE_QUERIES.map((query) => (
          <button
            key={query}
            type="button"
            onClick={() => onExampleClick(query)}
            data-testid="example-query"
            className="flex w-full items-center gap-3 rounded-ordilo-md border border-border bg-card px-4 py-3 text-left shadow-card card-lift press-scale focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
