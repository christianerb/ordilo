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
import {
  filterRecentDocuments,
  type HomeTask,
  type HomeDocument,
} from "@/lib/home-utils";
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
  upcomingTasks: HomeTask[];
  recentDocuments: HomeDocument[];
  insights: HomeInsight[];
  /** Open the scan wizard on mount (onboarding springboard: /home?scan=1). */
  autoOpenScan?: boolean;
}

/** Heute shows at most this many tasks — the screen answers "was brennt?" */
const HOME_TASK_LIMIT = 3;

// ---------------------------------------------------------------------------
// Status dot color mapping for BentoDocTile
// ---------------------------------------------------------------------------

// "analyzed" intentionally avoids apricot here: the "Zu bestätigen" grid
// already consists entirely of analyzed documents (the dot would be
// redundant there — see showStatusDot below), and "Zuletzt gescannt" can
// mix statuses, where a second apricot source would violate the Apricot
// Scarcity Rule (apricot is reserved for priority badges and urgent
// insights elsewhere on this page).
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
  upcomingTasks,
  recentDocuments,
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
    (taskId: string, newStatus: string) => {
      if (newStatus === "done") {
        toast.success("Erledigt — gut gemacht!");
      }
      toggleDone(taskId, newStatus);
    },
    [toggleDone],
  );
  const handleDismiss = dismiss;

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const visibleRecentDocs = filterRecentDocuments(recentDocuments);

  // ONE priority list: open, confirmed, dated tasks sorted by due date —
  // overdue lands first by construction. totalTasks counts the WHOLE
  // list (the server passes all confirmed open tasks unsliced), so
  // "Alle N Aufgaben anzeigen" never promises a number /aufgaben can't
  // deliver.
  const datedOpenTasks = localTasks
    .filter((t) => t.status === "open" && t.confirmed && t.due_date !== null)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const totalTasks = datedOpenTasks.length;
  const hasTasks = totalTasks > 0;
  const nextTasks = datedOpenTasks.slice(0, HOME_TASK_LIMIT);
  const hiddenTaskCount = totalTasks - nextTasks.length;

  const isFirstVisit =
    !hasTasks &&
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
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)] lg:gap-4">
            <div
              className="flex items-center justify-between rounded-ordilo-md bg-[var(--sand-warm)] p-4"
            >
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {greeting}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {familyName}
                </p>
              </div>
              {members.length > 0 && (
                <Link
                  href="/familie"
                  className="flex -space-x-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-full"
                  data-testid="member-list"
                  aria-label="Familie"
                >
                  {members.slice(0, 5).map((m) => (
                    <div
                      key={m.id}
                      className="flex size-8 items-center justify-center rounded-full border-2 border-[var(--wash-sage)] text-xs font-semibold text-white"
                      style={{
                        backgroundColor: m.avatar_color ?? "var(--petrol)",
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

            <Link
              href="/aufgaben"
              data-testid="home-stat-tasks"
              className="flex flex-col justify-center gap-1 rounded-ordilo-md border border-[var(--petrol)]/15 bg-[var(--petrol)]/[0.06] p-4 card-lift press-scale hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <CalendarClock
                className="size-4 text-[var(--petrol)]"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="text-2xl font-semibold tabular-nums text-foreground animate-count-up">
                {totalTasks}
              </span>
              <span className="text-xs text-muted-foreground">
                {totalTasks === 0
                  ? "Keine Aufgaben offen"
                  : totalTasks === 1
                    ? "Aufgabe offen"
                    : "Aufgaben offen"}
              </span>
            </Link>
          </div>

          {/* Proactive insights from the knowledge graph */}
          {insights.length > 0 && (
            <section data-testid="home-section-insights" className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">Hinweise</h2>
              <div className="space-y-2 stagger-children">
                {insights.map((insight) => (
                  <InsightTile
                    key={insight.id}
                    insight={insight}
                    onOpenDocument={openDocument}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Aufgaben — the screen answers ONE question: "was brennt?"
              Only the next few deadlines appear (overdue first); the full
              list lives one tap away on /aufgaben. */}
          {hasTasks && (
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

          {/* Zu bestätigen — bento grid of compact document tiles */}
          <section data-testid="home-section-review-docs" className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Zum Durchsehen</h2>
            {analyzedDocuments.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                {analyzedDocuments.map((doc) => (
                  <BentoDocTile
                    key={doc.id}
                    doc={doc}
                    showStatusDot={false}
                    onOpenDocument={openDocument}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <p className="text-sm text-muted-foreground">Alles durchgesehen — fein</p>
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

          {/* Zuletzt gescannt — bento grid of compact document tiles */}
          <section data-testid="home-section-recent-docs" className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Zuletzt gescannt</h2>
            {visibleRecentDocs.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                {visibleRecentDocs.map((doc) => (
                  <BentoDocTile
                    key={doc.id}
                    doc={doc}
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
 * Compact vertical document tile for the bento grid.
 * Shows file icon, status dot + label (2 lines), and relative time.
 *
 * `showStatusDot` defaults to true but is set to false by the "Zu
 * bestätigen" grid, where every tile has status "analyzed" — the dot
 * would carry no information there.
 */
function BentoDocTile({
  doc,
  showStatusDot = true,
  onOpenDocument,
}: {
  doc: HomeDocument;
  showStatusDot?: boolean;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const FileIcon = getFileIcon(doc.mime_type);
  const displayTitle = doc.title?.trim() || doc.original_filename || "Dokument";
  const relativeTime = formatRelativeTime(doc.created_at, true);
  const statusLabel = getStatusLabel(doc.status);

  return (
    <Link
      href={`/dokumente?doc=${doc.id}`}
      onClick={(e) => {
        e.preventDefault();
        void onOpenDocument(doc.id);
      }}
      className="flex flex-col gap-2 rounded-ordilo-sm border border-border bg-card p-3 shadow-card card-lift cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-center justify-between">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <FileIcon
            className="size-4"
            style={{ color: "var(--mist-dark)" }}
            strokeWidth={1.5}
          />
        </div>
        {showStatusDot && (
          <span className="flex items-center gap-1">
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
      <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {displayTitle}
      </p>
      {relativeTime && (
        <p className="text-xs tabular-nums text-muted-foreground">{relativeTime}</p>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Insight tile — proactive intelligence from the knowledge graph
// ---------------------------------------------------------------------------

const INSIGHT_ICONS: Record<HomeInsight["icon"], LucideIcon> = {
  alert: AlertCircle,
  receipt: Receipt,
  building: Building2,
  calendar: CalendarClock,
};

function InsightTile({
  insight,
  onOpenDocument,
}: {
  insight: HomeInsight;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const Icon = INSIGHT_ICONS[insight.icon] ?? AlertCircle;
  const isUrgent = insight.tone === "urgent";
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
      className={cn(
        "flex items-center gap-3 rounded-ordilo-sm border bg-card p-3 shadow-card card-lift cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isUrgent
          ? "border-[var(--apricot)]/30"
          : "border-[var(--petrol)]/15",
      )}
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
            isUrgent ? "text-[var(--apricot)]" : "text-[var(--petrol)]",
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
