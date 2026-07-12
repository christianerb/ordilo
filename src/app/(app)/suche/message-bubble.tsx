"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Sparkles,
  Search,
  CheckCircle2,
  ListChecks,
  Users,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
} from "lucide-react";
import { SourceCard, type SourceCardKind } from "@/components/ordilo/source-card";
import { SourceMatchCard } from "@/components/ordilo/source-match-card";
import { AnswerCard } from "@/components/ordilo/answer-card";
import { cn } from "@/lib/utils";
import type { ChatSource, AnswerCard as AnswerCardData } from "@/lib/schemas/chat";
import { ProcessingChecklist } from "./processing-checklist";

// Lazy-load ChatMarkdown (react-markdown + remark-gfm) to keep the
// /suche route chunk small. The markdown renderer is only needed when
// an AI response with text content is displayed.
const ChatMarkdown = dynamic(
  () =>
    import("@/components/ordilo/chat-markdown").then((m) => ({
      default: m.ChatMarkdown,
    })),
  { ssr: false },
);

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  /** Structured answer card, when the assistant chose to present one instead of plain text. */
  card?: AnswerCardData;
  /** Tool calls currently in progress (for status display). */
  toolCalls?: Array<{ toolName: string; state: string }>;
  /** Persisted feedback: "positive" | "negative" | null. */
  feedback?: "positive" | "negative" | null;
}

/**
 * Derive the source-kind icon/label for a citation row from its excerpt.
 * Graph-derived sources carry a synthetic prefix ("Aufgabe: ", "Person: ")
 * identifying what kind of search surfaced them; everything else came
 * from the document search.
 */
function getSourceKind(source: ChatSource): SourceCardKind {
  const excerpt = source.excerpt ?? "";
  if (excerpt.startsWith("Aufgabe: ")) {
    return { icon: ListChecks, label: "Aufgaben-Suche" };
  }
  if (excerpt.startsWith("Person: ")) {
    return { icon: Users, label: "Personen-Suche" };
  }
  return { icon: FileText, label: "Dokumenten-Suche" };
}

/** Sources at/above this relevance are promoted to a prominent match card. */
const TOP_SOURCE_SCORE_THRESHOLD = 0.5;
/** Cap on how many sources can be promoted, so the grid never overwhelms the answer. */
const MAX_TOP_SOURCES = 4;

/**
 * Split sources (sorted by relevance) into a small set of high-relevance
 * "top" matches and everything else. There is always at least one top
 * match when sources exist, so the best result is never buried in the
 * plain list — but low-relevance citations stay out of the way instead of
 * padding out a long "Quellen" list (VAL-CHAT design: geiler answers,
 * minimalistic references).
 */
function splitSources(sources: ChatSource[]): {
  top: ChatSource[];
  rest: ChatSource[];
} {
  const sorted = [...sources].sort((a, b) => b.score - a.score);
  let top = sorted
    .filter((s) => s.score >= TOP_SOURCE_SCORE_THRESHOLD)
    .slice(0, MAX_TOP_SOURCES);
  if (top.length === 0 && sorted.length > 0) {
    top = [sorted[0]];
  }
  const topIds = new Set(top.map((s) => s.document_id));
  const rest = sorted.filter((s) => !topIds.has(s.document_id));
  return { top, rest };
}

export function MessageBubble({
  message,
  isStreaming = false,
  passesFilters,
  onSourceCardClick,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  passesFilters: (docId: string) => boolean;
  onSourceCardClick: (docId: string) => void;
}) {
  const isUser = message.role === "user";

  const visibleSources = message.sources.filter((s) =>
    passesFilters(s.document_id),
  );
  const { top: topSources, rest: restSources } = splitSources(visibleSources);

  if (isUser) {
    return (
      <div className="flex justify-end animate-message-in">
        <div className="max-w-[85%] rounded-ordilo-md rounded-tr-sm bg-[var(--petrol)] px-4 py-3 text-white shadow-card lg:max-w-[70%]">
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  const activeToolCalls = message.toolCalls?.filter(
    (tc) => tc.state === "input-streaming" || tc.state === "input-available",
  );

  // Show the loading checklist while streaming but no answer (text or
  // card) has arrived yet.
  const showLoading = isStreaming && !message.content && !message.card;
  const hasAnswer = !showLoading && (message.content || message.card);

  return (
    <div className="flex flex-col items-start gap-2 animate-message-in">
      <div className="flex items-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]">
          <Sparkles className="size-4 text-white" aria-hidden="true" />
        </div>

        <div className="max-w-[85%] rounded-ordilo-md rounded-tl-sm bg-card px-4 py-3 shadow-card lg:max-w-full">
          {/* Tool-call status indicators */}
          {activeToolCalls && activeToolCalls.length > 0 && (
            <div className="mb-2 space-y-1">
              {activeToolCalls.map((tc, i) => (
                <ToolCallStatus key={i} toolName={tc.toolName} />
              ))}
            </div>
          )}

          {showLoading ? (
            <ProcessingChecklist />
          ) : message.card ? (
            <AnswerCard
              card={message.card}
              onActionClick={onSourceCardClick}
            />
          ) : (
            <div data-testid="message-content">
              <ChatMarkdown content={message.content} />
              {isStreaming && (
                <span
                  className="ml-0.5 inline-block w-[2px] h-4 bg-[var(--petrol)] align-text-bottom animate-pulse"
                  aria-hidden="true"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {hasAnswer && <AnswerFeedback message={message} />}

      {visibleSources.length > 0 && !isStreaming && (
        <div className="ml-10 w-[calc(100%-40px)] space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Quellen
          </span>
          <div
            className={cn(
              "grid gap-2",
              topSources.length > 1 && "sm:grid-cols-2",
            )}
          >
            {topSources.map((source, i) => (
              <SourceMatchCard
                key={source.document_id}
                documentId={source.document_id}
                title={source.title}
                score={source.score}
                kind={getSourceKind(source)}
                onClick={() => onSourceCardClick(source.document_id)}
                style={{ animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
          {restSources.length > 0 && (
            <RestSources
              sources={restSources}
              getSourceKind={getSourceKind}
              onSourceCardClick={onSourceCardClick}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsed low-relevance sources
// ---------------------------------------------------------------------------

/**
 * Low-relevance sources stay collapsed behind a quiet toggle — the answer
 * and its best matches carry the screen; the long tail is one tap away
 * instead of padding the conversation (answer-first hierarchy).
 */
function RestSources({
  sources,
  getSourceKind: kindFor,
  onSourceCardClick,
}: {
  sources: ChatSource[];
  getSourceKind: (source: ChatSource) => SourceCardKind;
  onSourceCardClick: (docId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="px-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
        data-testid="show-more-sources"
      >
        {sources.length === 1
          ? "1 weiteres mögliches Dokument anzeigen"
          : `${sources.length} weitere mögliche Dokumente anzeigen`}
      </button>
    );
  }

  return (
    <div className="space-y-0.5 pt-0.5">
      {sources.map((source, i) => (
        <SourceCard
          key={source.document_id}
          documentId={source.document_id}
          title={source.title}
          score={source.score}
          kind={kindFor(source)}
          onClick={() => onSourceCardClick(source.document_id)}
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback icons (thumbs up/down + copy)
// ---------------------------------------------------------------------------

/** Build a plain-text representation of an assistant message for copying. */
function messageToPlainText(message: ChatMessage): string {
  if (message.card) {
    const lines = [message.card.title];
    if (message.card.subtitle) lines.push(message.card.subtitle);
    for (const field of message.card.fields) {
      lines.push(`${field.label}: ${field.value}`);
    }
    return lines.join("\n");
  }
  return message.content;
}

function AnswerFeedback({ message }: { message: ChatMessage }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(
    message.feedback === "positive" ? "up" : message.feedback === "negative" ? "down" : null,
  );
  const [copied, setCopied] = useState(false);

  const handleFeedback = async (value: "up" | "down") => {
    setFeedback((prev) => {
      const next = prev === value ? null : value;
      // Persist to the server (best-effort, non-blocking).
      if (message.id && !message.id.startsWith("ai-")) {
        const payload = next === "up" ? "positive" : next === "down" ? "negative" : null;
        if (payload) {
            void fetch("/api/chat/feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message_id: message.id, feedback: payload }),
            }).catch(() => {});
        }
      }
      return next;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageToPlainText(message));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be unavailable (permissions/browser) — ignore.
    }
  };

  return (
    <div
      className="ml-10 flex items-center gap-1"
      data-testid="answer-feedback"
    >
      <button
        type="button"
        onClick={() => handleFeedback("up")}
        aria-pressed={feedback === "up"}
        aria-label="Antwort war hilfreich"
        data-testid="feedback-up"
        className={cn(
          "rounded-ordilo-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          feedback === "up" && "text-[var(--petrol)]",
        )}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => handleFeedback("down")}
        aria-pressed={feedback === "down"}
        aria-label="Antwort war nicht hilfreich"
        data-testid="feedback-down"
        className={cn(
          "rounded-ordilo-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          feedback === "down" && "text-destructive",
        )}
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Antwort kopieren"
        data-testid="feedback-copy"
        className="rounded-ordilo-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {copied ? (
          <Check
            className="size-3.5"
            style={{ color: "var(--petrol)" }}
            aria-hidden="true"
          />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool-call status indicator (Phase 5)
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, { icon: typeof Search; label: string }> = {
  search_documents: { icon: Search, label: "Durchsuche Dokumente…" },
  list_tasks: { icon: ListChecks, label: "Aufgaben werden geladen…" },
  list_family_members: { icon: Users, label: "Familienmitglieder werden geladen…" },
  mark_task_done: { icon: CheckCircle2, label: "Aufgabe wird erledigt…" },
};

function ToolCallStatus({ toolName }: { toolName: string }) {
  const config = TOOL_LABELS[toolName];
  const Icon = config?.icon ?? Search;
  const label = config?.label ?? "Arbeitet…";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
      )}
    >
      <Icon className="size-3 animate-pulse" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
