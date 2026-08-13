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

  // ONE priority list: open, confirmed, dated tasks sorted by due date —
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
    priority: t.priority,
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

          {/* One page, one frame: header, hero band, then hairline-divided
              groups. The frame carries the single shadow; nothing inside
              nests a card (No-Shadow-Stacking). The hero keeps its tinted
              band — it is the visual peak; the groups below stay quiet. */}
          <div className="overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card">
            {/* Header — dateline + greeting + family, nothing else. The
                facts of the day live where they are actionable. */}
            <header className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                {/* A family journal entry starts with the date. */}
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="home-dateline"
                >
                  {dateline}
                </p>
                <h1 className="text-xl font-semibold text-foreground">
                  {greeting}
                </h1>
              </div>
              {members.length > 0 && (
                <Link
                  href="/familie"
                  className="flex shrink-0 -space-x-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-full"
                  data-testid="member-list"
                  aria-label={`Familie ${familyName}`}
                >
                  {members.slice(0, 5).map((m) => (
                    <div
                      key={m.id}
                      className="flex size-8 items-center justify-center rounded-full border-2 border-[var(--wash-sage)] text-xs font-semibold"
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
                  {members.length > 5 && (
                    <div className="flex size-8 items-center justify-center rounded-full border-2 border-[var(--wash-sage)] bg-[var(--mist-light)] text-xs font-semibold text-[var(--mist-dark)]">
                      +{members.length - 5}
                    </div>
                  )}
                </Link>
              )}
            </header>

            {/* The "Heute" hero — the peak of the page. Silent: the
                Erledigt beat in the band IS the confirmation, a toast on
                top would be the same signal twice. */}
            <div className="px-4 pb-4">
              <TodayHero
                state={hero}
                flat
                onMarkDone={(taskId) => void handleToggleDone(taskId, "done", true)}
              />
            </div>

            {/* Aufgaben — starts after the task the hero already covers;
                the full list lives one tap away on /aufgaben. */}
            {nextTasks.length > 0 && (
              <section
                data-testid="home-section-aufgaben"
                className="border-t border-border/60 px-4 py-3"
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

            {/* Deine Dokumente — the journal: awaiting confirmation first
                (with a chip), then the most recent scans. */}
            <section
              data-testid="home-section-journal"
              className="border-t border-border/60 px-4 py-3"
            >
              <div className="pb-1">
                <h2 className="text-sm font-semibold text-foreground">
                  Deine Dokumente
                </h2>
                {/* The one line a family actually wants here: is anything
                    waiting on me, and is everything safely stored? */}
                {journalDocCount > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {unconfirmedDocCount > 0
                      ? `${unconfirmedDocCount} ${unconfirmedDocCount === 1 ? "wartet" : "warten"} auf dein OK · ${journalDocCount} im Familienbuch`
                      : `${journalDocCount} ${journalDocCount === 1 ? "Dokument" : "Dokumente"} sicher im Familienbuch`}
                  </p>
                )}
              </div>
              {journalDocs.length > 0 ? (
                <div className="divide-y divide-[var(--mist-light)]/60">
                  {journalDocs.map((doc) => (
                    <JournalDocRow
                      key={doc.id}
                      doc={doc}
                      thumbUrl={thumbUrls[doc.id] ?? null}
                      onOpenDocument={openDocument}
                    />
                  ))}
                  {hasMoreJournalDocs && (
                    <Link
                      href="/dokumente"
                      className="-mx-4 block px-4 py-2.5 text-center text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--sand-warm)]/60 hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          </div>
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
  onOpenDocument,
}: {
  doc: HomeDocument;
  thumbUrl: string | null;
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
      className="-mx-4 flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--sand-warm)]/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          className="size-10 shrink-0 rounded-ordilo-sm border border-[var(--mist-light)] object-cover"
        />
      ) : (
        <div className="w-8 shrink-0">
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
        <span className="shrink-0 rounded-full bg-[var(--petrol)]/10 px-2 py-0.5 text-xs font-medium text-[var(--petrol)]">
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

