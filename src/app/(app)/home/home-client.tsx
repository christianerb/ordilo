"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  AlertCircle,
  Receipt,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import {
  getFileIcon,
  getStatusLabel,
} from "@/lib/schemas/document";
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
  composeBriefing,
  selectHomeHero,
  deriveSuggestionChips,
} from "@/lib/home-briefing";
import { TodayHero } from "./today-hero";
import type { HomeInsight } from "@/lib/ai/insights";

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
  greeting: string;
  familyName: string;
  members: HomeMember[];
  analyzedDocuments: HomeDocument[];
  /** Exact count of documents awaiting confirmation (the analyzedDocuments
      array itself is capped for display). */
  unconfirmedDocCount: number;
  upcomingTasks: HomeTask[];
  recentDocuments: HomeDocument[];
  /** Signed thumbnail URLs keyed by document id (image documents only). */
  thumbUrls: Record<string, string>;
  insights: HomeInsight[];
  /** Open the scan wizard on mount (onboarding springboard: /home?scan=1). */
  autoOpenScan?: boolean;
}

/** "Als Nächstes" shows at most this many tasks below the hero. */
const HOME_TASK_LIMIT = 3;

// ---------------------------------------------------------------------------
// Status dot color mapping for JournalDocTile
// ---------------------------------------------------------------------------

// "analyzed" intentionally avoids apricot here: analyzed documents get a
// "Bitte bestätigen" chip instead of a dot, and apricot on home belongs to
// the "Heute" hero alone (Apricot Scarcity Rule).
const STATUS_DOT_COLORS: Record<string, string> = {
  confirmed: "bg-[var(--petrol)]",
  analyzed: "bg-[var(--petrol)]/50",
  uploaded: "bg-[var(--mist)]",
  failed: "bg-[var(--destructive)]",
  ocr_processing: "bg-[var(--mist)] animate-pulse",
  analyzing: "bg-[var(--mist)] animate-pulse",
  ocr_done: "bg-[var(--petrol)]",
};

function getStatusDotClass(status: string): string {
  return STATUS_DOT_COLORS[status] ?? "bg-[var(--mist)]";
}

function getDocumentIdFromHref(href: string): string | null {
  if (!href.startsWith("/dokumente")) return null;
  const params = new URLSearchParams(href.split("?")[1] ?? "");
  return params.get("doc");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomeClient({
  greeting,
  familyName,
  members,
  analyzedDocuments,
  unconfirmedDocCount,
  upcomingTasks,
  recentDocuments,
  thumbUrls,
  insights,
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
    async (taskId: string, newStatus: string) => {
      const ok = await toggleDone(taskId, newStatus);
      if (ok && newStatus === "done") {
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

  // The daily briefing and the "Heute" hero are two views of the same
  // facts — the sentence under the greeting and the big card below it
  // always agree with each other and with the task list.
  const facts = deriveBriefingFacts(localTasks, unconfirmedDocCount);
  const briefing = composeBriefing(facts);
  const hero = selectHomeHero(facts, insights);
  const heroTaskId = hero.kind === "task" ? hero.task.id : null;
  const heroInsightId = hero.kind === "insight" ? hero.insight.id : null;
  // When the hero already carries apricot (overdue), urgent insight rows
  // render in petrol — one apricot element per view (Scarcity Rule).
  const suppressUrgentInsights =
    hero.kind === "task" && hero.urgency === "overdue";
  const visibleInsights = insights.filter((i) => i.id !== heroInsightId);

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
  // confirmation first (with a chip), then the most recent scans.
  const journalDocs = mergeJournalDocuments(analyzedDocuments, visibleRecentDocs);

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

          {/* Greeting + one-sentence daily briefing */}
          <div className="flex items-center justify-between rounded-ordilo-md bg-[var(--sand-warm)] p-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-foreground">
                {greeting}
              </h1>
              <p
                className="mt-0.5 text-sm text-muted-foreground"
                data-testid="home-briefing"
              >
                {briefing}
              </p>
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
          </div>

          {/* The "Heute" hero — the single most important thing right now */}
          <TodayHero
            state={hero}
            onMarkDone={(taskId) => void handleToggleDone(taskId, "done")}
          />

          {/* Proactive insights from the knowledge graph — one grouped
              surface with dividers instead of floating cards (the insight
              the hero already shows is filtered out). */}
          {visibleInsights.length > 0 && (
            <section data-testid="home-section-insights" className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">Hinweise</h2>
              <div className="divide-y divide-[var(--mist-light)]/60 rounded-ordilo-md border border-border bg-card shadow-card">
                {visibleInsights.map((insight) => (
                  <InsightRow
                    key={insight.id}
                    insight={insight}
                    suppressUrgent={suppressUrgentInsights}
                    onOpenDocument={openDocument}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Aufgaben — starts after the task the hero already covers;
              the full list lives one tap away on /aufgaben. */}
          {nextTasks.length > 0 && (
            <section data-testid="home-section-aufgaben" className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Als Nächstes</h2>
              <div className="space-y-2 stagger-children" data-testid="home-tasks-next">
                {nextTasks.map((task) => (
                  <TaskCard
                    key={task.id}
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
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
                  data-testid="home-tasks-show-all"
                >
                  Alle {totalTasks} Aufgaben anzeigen
                </Link>
              )}
            </section>
          )}

          {/* Deine Dokumente — the journal: awaiting confirmation first
              (with a chip), then the most recent scans, thumbnail-first. */}
          <section data-testid="home-section-journal" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Deine Dokumente
              </h2>
              {journalDocs.length > 0 && (
                <Link
                  href="/dokumente"
                  className="text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
                >
                  Alle anzeigen
                </Link>
              )}
            </div>
            {journalDocs.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(10rem,15rem))] md:gap-4 stagger-children">
                {journalDocs.map((doc) => (
                  <JournalDocTile
                    key={doc.id}
                    doc={doc}
                    thumbUrl={thumbUrls[doc.id] ?? null}
                    onOpenDocument={openDocument}
                  />
                ))}
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
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Journal tile — thumbnail-first (a real scan preview when available,
 * the generic file icon as fallback), title and relative time below.
 * Documents awaiting confirmation wear a "Bitte bestätigen" chip instead
 * of the status dot; other statuses keep the quiet dot + label.
 */
function JournalDocTile({
  doc,
  thumbUrl,
  onOpenDocument,
}: {
  doc: HomeDocument;
  thumbUrl: string | null;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const FileIcon = getFileIcon(doc.mime_type);
  const displayTitle = doc.title?.trim() || doc.original_filename || "Dokument";
  const relativeTime = formatRelativeTime(doc.created_at, true);
  const statusLabel = getStatusLabel(doc.status);
  const needsConfirmation = doc.status === "analyzed";

  // A signed thumbnail URL that fails to load (expired, transform not
  // available on the plan, ...) falls back to the icon variant — the tile
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
      className="flex flex-col gap-2 rounded-ordilo-sm border border-border bg-card p-3 shadow-card card-lift cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          className="aspect-[3/4] w-full rounded-ordilo-sm border border-[var(--mist-light)] object-cover"
        />
      ) : (
        <div
          className="flex aspect-[3/4] w-full items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <FileIcon
            className="size-6"
            style={{ color: "var(--mist-dark)" }}
            strokeWidth={1.5}
          />
        </div>
      )}
      <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {displayTitle}
      </p>
      <div className="flex items-center justify-between gap-2">
        {relativeTime && (
          <p className="text-xs tabular-nums text-muted-foreground">{relativeTime}</p>
        )}
        {needsConfirmation ? (
          <span className="shrink-0 rounded-full bg-[var(--petrol)]/10 px-2 py-0.5 text-xs font-medium text-[var(--petrol)]">
            Bitte bestätigen
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <span
              className={cn("size-2 rounded-full", getStatusDotClass(doc.status))}
              aria-hidden="true"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {statusLabel}
            </span>
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Insight row — one line inside the grouped Hinweise surface
// ---------------------------------------------------------------------------

const INSIGHT_ICONS: Record<HomeInsight["icon"], LucideIcon> = {
  alert: AlertCircle,
  receipt: Receipt,
  building: Building2,
  calendar: CalendarClock,
};

function InsightRow({
  insight,
  suppressUrgent,
  onOpenDocument,
}: {
  insight: HomeInsight;
  /** True while the hero already carries apricot — urgent rows then
      render in petrol so the view keeps exactly one apricot element. */
  suppressUrgent: boolean;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const Icon = INSIGHT_ICONS[insight.icon] ?? AlertCircle;
  const isUrgent = insight.tone === "urgent" && !suppressUrgent;
  const documentId = getDocumentIdFromHref(insight.href);

  return (
    <Link
      href={insight.href}
      onClick={(e) => {
        if (!documentId) return;
        e.preventDefault();
        void onOpenDocument(documentId);
      }}
      data-testid="insight-tile"
      className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-[var(--sand-warm)]/60 first:rounded-t-ordilo-md last:rounded-b-ordilo-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm",
          isUrgent
            ? "bg-[var(--apricot)]/10"
            : "bg-[var(--petrol)]/[0.06]",
        )}
        aria-hidden="true"
      >
        <Icon
          className={cn(
            "size-4",
            isUrgent ? "text-[var(--apricot-text)]" : "text-[var(--petrol)]",
          )}
          strokeWidth={2}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{insight.title}</p>
        {insight.detail && (
          <p className="truncate text-xs text-muted-foreground">
            {insight.detail}
          </p>
        )}
      </div>
    </Link>
  );
}
