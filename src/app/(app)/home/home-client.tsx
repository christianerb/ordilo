"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, CalendarDays, ChevronRight, FileCheck2, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ordilo/empty-state";
import { cn } from "@/lib/utils";
import { formatGermanDate, formatRelativeTime } from "@/lib/format";
import { useTaskMutation } from "@/lib/hooks/use-task-mutation";
import { useDocumentViewer, useScanActions } from "@/lib/scan/scan-context";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { SuggestionChipsRegistrar } from "@/lib/search/suggestion-chips-context";
import { toLocalDateStr, type HomeTask, type HomeDocument } from "@/lib/home-utils";
import {
  deriveBriefingFacts,
  composeBriefing,
  selectHomeHero,
  deriveSuggestionChips,
} from "@/lib/home-briefing";
import { TodayHero } from "./today-hero";
import { INSIGHT_ICONS } from "./insight-icons";
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

/** A calendar entry happening today, trimmed for the cockpit. */
export interface HomeCalendarEvent {
  id: string;
  title: string;
  /** HH:MM(:SS) or null for all-day entries. */
  starts_time: string | null;
  ends_time: string | null;
  location: string | null;
  /** Accent color of the responsible member or first attendee. */
  color: string | null;
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
  /** Today's calendar entries (all-day first, then by start time). */
  todayEvents?: HomeCalendarEvent[];
  /** Whether the family has at least one document, including confirmed ones. */
  hasDocuments: boolean;
  insights: HomeInsight[];
  /** Open the scan wizard on mount (onboarding springboard: /home?scan=1). */
  autoOpenScan?: boolean;
}

/** "Als Nächstes" shows at most this many tasks below the hero. */
const HOME_TASK_LIMIT = 3;
const THREE_DAY_HORIZON = 2;

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
  todayEvents = [],
  hasDocuments,
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

  const { toggleDone } = useTaskMutation({
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
  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

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

  // The cockpit only looks three calendar days ahead: today plus the next
  // two days. The hero already owns the single most urgent task, so it
  // does not repeat in this compact overview.
  const today = toLocalDateStr(new Date());
  const threeDayHorizon = toLocalDateStr(
    new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate() + THREE_DAY_HORIZON,
    ),
  );
  const nextTasks = datedOpenTasks
    .filter(
      (t) =>
        t.id !== heroTaskId &&
        t.due_date !== null &&
        t.due_date >= today &&
        t.due_date <= threeDayHorizon,
    )
    .slice(0, HOME_TASK_LIMIT);

  const isFirstVisit =
    totalTasks === 0 &&
    analyzedDocuments.length === 0 &&
    !hasDocuments;

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

          {/* The "Heute" hero — the single most important thing right now */}
          <TodayHero
            state={hero}
            onMarkDone={(taskId) => void handleToggleDone(taskId, "done")}
          />

          {/* Today's calendar entries — the family's day at a glance,
              one tap away from the full planner. */}
          {todayEvents.length > 0 && (
            <section data-testid="home-section-today-events" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Heute im Kalender
                  </h2>
                </div>
                <Link
                  href="/aufgaben?tab=planer"
                  className="shrink-0 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="home-events-show-planner"
                >
                  Zum Planer
                </Link>
              </div>
              <div className="divide-y divide-[var(--mist-light)]/60 overflow-hidden rounded-ordilo-sm border border-border bg-card shadow-card">
                {todayEvents.map((event) => (
                  <Link
                    key={event.id}
                    href="/aufgaben?tab=planer"
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    data-testid={`home-today-event-${event.id}`}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full bg-primary"
                      style={
                        event.color
                          ? { backgroundColor: event.color }
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-foreground">
                      {event.starts_time ? (
                        event.starts_time.slice(0, 5)
                      ) : (
                        <CalendarDays
                          className="size-4 text-muted-foreground"
                          aria-label="Ganztägig"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {event.title}
                      </span>
                      {event.location && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" aria-hidden="true" />
                          <span className="truncate">{event.location}</span>
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* The home screen is a cockpit: the immediate, short-horizon
              task overview comes before passive document history. */}
          <section data-testid="home-section-next-days" className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Nächste 3 Tage
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Was als Nächstes ansteht.
                </p>
              </div>
              {totalTasks > nextTasks.length + (heroTaskId ? 1 : 0) && (
                <Link
                  href="/aufgaben"
                  className="shrink-0 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="home-tasks-show-all"
                >
                  Alle anzeigen
                </Link>
              )}
            </div>
            {nextTasks.length > 0 ? (
              <div
                className="divide-y divide-[var(--mist-light)]/60 overflow-hidden rounded-ordilo-sm border border-border bg-card shadow-card"
                data-testid="home-tasks-next"
              >
                {nextTasks.map((task) => (
                  <NextDaysTaskRow
                    key={task.id}
                    task={task}
                    onMarkDone={() => void handleToggleDone(task.id, "done")}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-ordilo-sm bg-[var(--surface-story)] px-3 py-2.5 text-sm text-muted-foreground">
                In den nächsten drei Tagen steht nichts an.
              </p>
            )}
          </section>

          {/* Documents only earn space on home when a person needs to
              review them. Confirmed documents remain in /dokumente. */}
          {analyzedDocuments.length > 0 && (
            <section data-testid="home-section-document-review" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Dokumente prüfen
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Ordilo braucht dein OK.
                  </p>
                </div>
                <Link
                  href="/dokumente"
                  className="shrink-0 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {unconfirmedDocCount > analyzedDocuments.length
                    ? `Alle ${unconfirmedDocCount} ansehen`
                    : "Alle anzeigen"}
                </Link>
              </div>
              <div className="divide-y divide-[var(--mist-light)]/60 overflow-hidden rounded-ordilo-sm border border-border bg-card shadow-card">
                {analyzedDocuments.map((doc) => (
                  <DocumentReviewRow
                    key={doc.id}
                    doc={doc}
                    onOpenDocument={openDocument}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Proactive insights are useful context, but do not displace
              the family's tasks and review queue from the cockpit. */}
          {visibleInsights.length > 0 && (
            <section data-testid="home-section-insights" className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">Hinweise</h2>
              <div className="divide-y divide-[var(--mist-light)]/60 overflow-hidden rounded-ordilo-sm border border-border bg-card shadow-card">
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
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NextDaysTaskRow({
  task,
  onMarkDone,
}: {
  task: HomeTask;
  onMarkDone: () => void;
}) {
  const dueDate = task.due_date ? formatGermanDate(task.due_date) : null;

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Aufgabe als erledigt markieren: ${task.title}`}
        onClick={onMarkDone}
        data-testid="task-checkbox"
        className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--mist)] bg-transparent transition-colors hover:border-[var(--petrol)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Link
        href="/aufgaben"
        className="min-w-0 flex-1 rounded-ordilo-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        {dueDate && (
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {task.due_date === toLocalDateStr(new Date())
              ? "Heute"
              : dueDate}
            {task.document_title ? ` · ${task.document_title}` : ""}
          </p>
        )}
      </Link>
      <ChevronRight className="size-4 shrink-0 text-[var(--mist)]" aria-hidden="true" />
    </div>
  );
}

function DocumentReviewRow({
  doc,
  onOpenDocument,
}: {
  doc: HomeDocument;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const displayTitle = doc.title?.trim() || doc.original_filename || "Dokument";
  const relativeTime = formatRelativeTime(doc.created_at, true);

  return (
    <Link
      href={`/dokumente?doc=${doc.id}`}
      onClick={(event) => {
        event.preventDefault();
        void onOpenDocument(doc.id);
      }}
      className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[var(--sand-warm)]/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      aria-label={`Dokument prüfen: ${displayTitle}`}
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/[0.06]"
        aria-hidden="true"
      >
        <FileCheck2 className="size-4 text-[var(--petrol)]" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayTitle}</p>
        {relativeTime && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Eingescannt {relativeTime}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium text-[var(--petrol)]">
        Prüfen
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Insight row — one line inside the grouped Hinweise surface
// ---------------------------------------------------------------------------

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
