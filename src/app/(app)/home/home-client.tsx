"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { getStatusLabel } from "@/lib/schemas/document";
import { useTaskMutation } from "@/lib/hooks/use-task-mutation";
import { useDocumentViewer, useScanActions } from "@/lib/scan/scan-context";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { SuggestionChipsRegistrar } from "@/lib/search/suggestion-chips-context";
import { cn } from "@/lib/utils";
import {
  getAvatarTextColor,
  resolveAvatarColor,
} from "@/lib/avatar-colors";
import {
  filterRecentDocuments,
  mergeJournalDocuments,
  JOURNAL_DOCS_LIMIT,
  type HomeTask,
  type HomeDocument,
} from "@/lib/home-utils";
import {
  deriveBriefingFacts,
  selectHomeHero,
  deriveSuggestionChips,
} from "@/lib/home-briefing";
import { TodayHero } from "./today-hero";
import { FirstSuccessGuide } from "@/components/ordilo/first-success-guide";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HomeMember {
  id: string;
  name: string;
  role: string | null;
  avatar_color: string | null;
}

export interface HomeClientProps {
  familyId: string;
  greeting: string;
  familyName: string;
  members: HomeMember[];
  analyzedDocuments: HomeDocument[];
  /** Exact count of documents awaiting confirmation (the analyzedDocuments
      array itself is capped for display). */
  unconfirmedDocCount: number;
  /** Total non-failed documents — the "… sicher im Familienbuch" line. */
  journalDocCount: number;
  /** Exact confirmed-document count, used for one-time first-success help. */
  confirmedDocumentCount: number;
  upcomingTasks: HomeTask[];
  recentDocuments: HomeDocument[];
  /** Signed thumbnail URLs keyed by document id (image documents only). */
  thumbUrls: Record<string, string>;
  /** Open the scan wizard on mount (onboarding springboard: /home?scan=1). */
  autoOpenScan?: boolean;
}

/** "Als Nächstes" shows at most this many tasks below the hero. */
const HOME_TASK_LIMIT = 3;

/** The home journal shows at most this many rows, then "Mehr anzeigen". */
const HOME_JOURNAL_LIMIT = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomeClient({
  familyId,
  greeting,
  familyName,
  members,
  analyzedDocuments,
  unconfirmedDocCount,
  journalDocCount,
  confirmedDocumentCount,
  upcomingTasks,
  recentDocuments,
  thumbUrls,
  autoOpenScan = false,
}: HomeClientProps) {
  const { openWizard } = useScanActions();
  const { openDocument } = useDocumentViewer();

  // Onboarding springboard: /home?scan=1 opens the scanner immediately —
  // the user tapped "Erstes Dokument scannen" and should land in the
  // camera, not on a dashboard. Clean the param so refresh/back does not
  // reopen the wizard.
  useMountEffect(() => {
    if (!autoOpenScan) return;
    openWizard();
    window.history.replaceState(null, "", "/home");
  });
  const [localTasks, setLocalTasks] = useState<HomeTask[]>(upcomingTasks);

  const { toggleDone, dismiss } = useTaskMutation({
    onOptimisticToggle: (taskId, newStatus) =>
      setLocalTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t,
        ),
      ),
    onRevertToggle: (taskId, newStatus) =>
      setLocalTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: newStatus === "done" ? "open" : "done" }
            : t,
        ),
      ),
    onOptimisticDismiss: (taskId) =>
      setLocalTasks((prev) => prev.filter((t) => t.id !== taskId)),
    onRevertDismiss: (taskId) =>
      setLocalTasks((prev) => {
        const task = upcomingTasks.find((t) => t.id === taskId);
        return task ? [...prev, task] : prev;
      }),
    onToggleError: () =>
      toast.error("Speichern hat nicht geklappt — bitte nochmal versuchen"),
    onDismissError: () =>
      toast.error("Hat nicht geklappt — bitte nochmal versuchen"),
  });

  const handleToggleDone = useCallback(
    async (taskId: string, newStatus: string, silent = false) => {
      const ok = await toggleDone(taskId, newStatus);
      if (ok && newStatus === "done" && !silent) {
        toast.success("Erledigt — gut gemacht!");
      }
    },
    [toggleDone],
  );
  const handleDismiss = dismiss;

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  // JOURNAL_DOCS_LIMIT (not the old RECENT_DOCS_LIMIT default): the
  // journal merge dedupes against the analyzed documents, and the grid
  // should still fill up when the newest confirmed docs ARE the analyzed
  // ones.
  const visibleRecentDocs = filterRecentDocuments(
    recentDocuments,
    JOURNAL_DOCS_LIMIT,
  );

  // ONE list: open, confirmed, dated tasks sorted by due date —
  // overdue lands first by construction. totalTasks counts the WHOLE
  // list (the server passes all confirmed open tasks unsliced), so
  // "Alle N Aufgaben anzeigen" never promises a number /aufgaben can't
  // deliver.
  const datedOpenTasks = localTasks
    .filter((t) => t.status === "open" && t.confirmed && t.due_date !== null)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const totalTasks = datedOpenTasks.length;

  // The hero and the suggestion chips are two views of the same facts —
  // the big card and the composer questions always agree with the task
  // list below. (A separate briefing sentence used to sit under the
  // greeting; it said exactly what the hero and journal header already
  // show, so the distill pass cut it.)
  const facts = deriveBriefingFacts(localTasks, unconfirmedDocCount);
  // Journal dateline, e.g. "Montag, 6. Juli" — computed per render so the
  // date is always the day the user is actually looking at.
  const dateline = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const hero = selectHomeHero(facts);
  const heroTaskId = hero.kind === "task" ? hero.task.id : null;

  // Contextual questions for the composer chips — same facts, so a chip
  // never asks about something the screen contradicts.
  const suggestionChips = deriveSuggestionChips(facts);

  // "Als Nächstes" starts AFTER the task the hero already shows.
  const nextTasks = datedOpenTasks
    .filter((t) => t.id !== heroTaskId)
    .slice(0, HOME_TASK_LIMIT);
  const hiddenTaskCount =
    totalTasks - (heroTaskId ? 1 : 0) - nextTasks.length;

  // The journal merges the two former document sections: awaiting
  // confirmation first (with a chip), then the most recent scans. Home
  // shows only the newest three — the rest lives on /dokumente behind
  // "Mehr anzeigen".
  const journalDocs = mergeJournalDocuments(
    analyzedDocuments,
    visibleRecentDocs,
    HOME_JOURNAL_LIMIT,
  );
  const hasMoreJournalDocs = journalDocCount > journalDocs.length;

  const isFirstVisit =
    totalTasks === 0 &&
    analyzedDocuments.length === 0 &&
    visibleRecentDocs.length === 0;

  const toTaskCardData = (t: HomeTask): TaskCardData => ({
    id: t.id,
    family_id: t.family_id,
    document_id: t.document_id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    status: t.status,
    confidence: t.confidence,
    confirmed: t.confirmed,
    created_at: t.created_at,
    tags: t.tags,
    document_title: t.document_title ?? null,
    assigned_to: t.assigned_to ?? null,
    assigned_member_name: null,
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="app-page-stack">
      {isFirstVisit ? (
        <EmptyState
          title="Schön, dass du da bist"
          description="Scanne dein erstes Dokument und Ordilo bringt Ordnung in deinen Papierkram — ganz ohne Aktenordner."
          mascotMood="greeting"
          actionLabel="Dokument scannen"
          onAction={openWizard}
          className="py-16"
        />
      ) : (
        <>
          {/* Keyed registrar: chip changes remount it, and the sanctioned
              mount effect re-registers the new questions (no useEffect
              dependency arrays in this codebase). */}
          <SuggestionChipsRegistrar
            key={suggestionChips.join("\n")}
            chips={suggestionChips}
          />

          {confirmedDocumentCount === 1 ? (
            <FirstSuccessGuide familyId={familyId} onScan={openWizard} />
          ) : null}

          {/* The day starts as one journal entry: date, greeting and the
              one thing that needs attention belong together. */}
          <section
            className="relative overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--surface-box)] p-4 shadow-card"
            data-testid="home-priority-card"
          >
            <div
              className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-[var(--wash-sage)]/65"
              aria-hidden="true"
            />
            <header className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="home-dateline"
                >
                  {dateline}
                </p>
                <h1 className="mt-1 text-[1.35rem] font-semibold leading-tight text-foreground">
                  {greeting}
                </h1>
                {familyName && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    Familie {familyName}
                  </p>
                )}
              </div>
              {members.length > 0 && (
                <Link
                  href="/familie"
                  className="relative z-10 flex shrink-0 -space-x-2 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="member-list"
                  aria-label={`Familie ${familyName}`}
                >
                  {members.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="flex size-8 items-center justify-center rounded-full border-2 border-[var(--surface-box)] text-xs font-semibold"
                      style={{
                        backgroundColor: resolveAvatarColor(m.avatar_color),
                        color: getAvatarTextColor(m.avatar_color),
                      }}
                      title={m.name}
                      aria-label={m.name}
                    >
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {members.length > 3 && (
                    <div className="flex size-8 items-center justify-center rounded-full border-2 border-[var(--surface-box)] bg-[var(--mist-light)] text-xs font-semibold text-[var(--mist-dark)]">
                      +{members.length - 3}
                    </div>
                  )}
                </Link>
              )}
            </header>

            {/* The "Heute" task is embedded in the greeting card, as the
                reference's one clear priority rather than a second dashboard
                panel. */}
            <div className="relative mt-4">
              <TodayHero
                state={hero}
                flat
                onMarkDone={(taskId) => void handleToggleDone(taskId, "done", true)}
              />
            </div>
          </section>

          {/* Documents are their own quiet book surface, with the one item
              that needs confirmation gently lifted inside the list. */}
          <section
            data-testid="home-section-journal"
            className="overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--surface-box)] px-4 py-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-3 pb-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Deine Dokumente
                </h2>
                {journalDocCount > 0 && !unconfirmedDocCount && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {journalDocCount} {journalDocCount === 1 ? "Dokument" : "Dokumente"} im Familienbuch
                  </p>
                )}
              </div>
              {unconfirmedDocCount > 0 && (
                <span className="shrink-0 rounded-full bg-[var(--wash-sage)] px-2.5 py-1 text-xs font-medium text-[var(--petrol)]">
                  {unconfirmedDocCount} {unconfirmedDocCount === 1 ? "wartet" : "warten"} auf dein OK
                </span>
              )}
            </div>
            {journalDocs.length > 0 ? (
              <div className="overflow-hidden rounded-ordilo-sm border border-border/70">
                {journalDocs.map((doc, index) => (
                  <JournalDocRow
                    key={doc.id}
                    doc={doc}
                    thumbUrl={thumbUrls[doc.id] ?? null}
                    highlighted={index === 0 && doc.status === "analyzed"}
                    onOpenDocument={openDocument}
                  />
                ))}
                {hasMoreJournalDocs && (
                  <Link
                    href="/dokumente"
                    className="block border-t border-border/70 px-4 py-2.5 text-center text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--sand-warm)]/60 hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Mehr anzeigen
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <p className="text-sm text-muted-foreground">Noch keine Dokumente</p>
                <button
                  type="button"
                  onClick={openWizard}
                  className="rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Dokument scannen
                </button>
              </div>
            )}
          </section>

          {/* Aufgaben stay available below the immediate briefing. They are
              intentionally lighter than the day card and document journal. */}
          {nextTasks.length > 0 && (
            <section
              data-testid="home-section-aufgaben"
              className="overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--surface-story)] px-4 py-3 shadow-card"
            >
              <h2 className="pb-1 text-sm font-semibold text-foreground">Als Nächstes</h2>
              <div className="divide-y divide-[var(--mist-light)]/60" data-testid="home-tasks-next">
                {nextTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    flat
                    task={toTaskCardData(task)}
                    onToggleDone={(newStatus) =>
                      handleToggleDone(task.id, newStatus)
                    }
                    onDismiss={() => handleDismiss(task.id)}
                    showConfidence={false}
                  />
                ))}
              </div>
              {hiddenTaskCount > 0 && (
                <Link
                  href="/aufgaben"
                  className="mt-1 inline-flex items-center gap-1 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="home-tasks-show-all"
                >
                  Alle {totalTasks} Aufgaben anzeigen
                </Link>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Journal row — a compact line in the family journal, not a poster.
 * Small preview on the left (real scan thumb or paper sheet), title and
 * the AI one-liner as subtitle, date or "Bitte bestätigen" chip on the
 * right. Status only speaks when it has something to say.
 */
function JournalDocRow({
  doc,
  thumbUrl,
  highlighted = false,
  onOpenDocument,
}: {
  doc: HomeDocument;
  thumbUrl: string | null;
  /** The first document waiting on a review gets a calm contextual lift. */
  highlighted?: boolean;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const displayTitle = doc.title?.trim() || doc.original_filename || "Dokument";
  const relativeTime = formatRelativeTime(doc.created_at, true);
  const statusLabel = getStatusLabel(doc.status);
  const needsConfirmation = doc.status === "analyzed";
  // The subtitle answers "what is this?" before the user has to open it.
  const subtitle =
    doc.summary?.trim() ||
    (doc.status !== "confirmed" && doc.status !== "analyzed"
      ? statusLabel
      : null);

  // A signed thumbnail URL that fails to load (expired, transform not
  // available on the plan, ...) falls back to the paper sheet — the row
  // never renders a broken image.
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = thumbUrl !== null && !thumbFailed;

  return (
    <Link
      href={`/dokumente?doc=${doc.id}`}
      onClick={(e) => {
        e.preventDefault();
        void onOpenDocument(doc.id);
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        highlighted
          ? "bg-[var(--wash-sage-soft)] hover:bg-[var(--wash-sage)]"
          : "border-t border-border/70 first:border-t-0 hover:bg-[var(--sand-warm)]/60",
      )}
    >
      {showThumb ? (
        // Signed URLs are already resized by Supabase image transforms;
        // the Next.js optimizer would only add latency here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          onError={() => setThumbFailed(true)}
          className="size-11 shrink-0 rounded-ordilo-sm border border-[var(--mist-light)] object-cover"
        />
      ) : (
        <div className="w-9 shrink-0">
          <PaperPreview mimeType={doc.mime_type} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-foreground"
          title={displayTitle}
        >
          {displayTitle}
        </p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {needsConfirmation ? (
        <span className="shrink-0 rounded-full bg-[var(--petrol)] px-2.5 py-1 text-xs font-medium text-white">
          Bitte bestätigen
        </span>
      ) : relativeTime ? (
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {relativeTime}
        </p>
      ) : null}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Journal tile fallback — a stylized paper sheet instead of an empty box
// ---------------------------------------------------------------------------

/** Short, known file-type labels for the paper fallback (null = hide). */
const PAPER_EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
};

/**
 * Shown when no real thumbnail exists (PDFs, or image transforms not
 * available on the plan). A warm paper-sheet illustration — folded
 * corner, a few text lines, file-type label below — so the tile reads
 * as an intentional document preview instead of a missing image. The
 * subtle Sand → Sand Light wash follows the ambient-gradient rule.
 */
function PaperPreview({ mimeType }: { mimeType: string | null }) {
  const ext = mimeType ? (PAPER_EXT_BY_MIME[mimeType] ?? null) : null;
  return (
    <div
      className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2.5 rounded-ordilo-sm border border-[var(--mist-light)]/50 bg-gradient-to-b from-[var(--sand)] to-[var(--sand-light)]"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 46"
        className="w-9 text-[var(--mist)]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          d="M6 1.5h15l9 9v32a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V4.5a3 3 0 0 1 3-3z"
          fill="var(--warm-white)"
          strokeLinejoin="round"
        />
        <path d="M21 1.5v9h9" strokeLinejoin="round" />
        <path
          d="M9.5 20h17M9.5 26h17M9.5 32h11"
          strokeLinecap="round"
          opacity={0.45}
        />
      </svg>
      {ext && (
        <span className="text-[10px] font-medium text-[var(--mist-dark)]">
          {ext}
        </span>
      )}
    </div>
  );
}

