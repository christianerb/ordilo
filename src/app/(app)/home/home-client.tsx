"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ScanLine,
  CalendarClock,
  FileCheck,
  CalendarDays,
  Clock,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { AISearchBar } from "@/components/ordilo/ai-search-bar";
import { DocumentCard } from "@/components/ordilo/document-card";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import { createClient } from "@/lib/supabase/client";
import {
  filterHeuteWichtig,
  filterFristen,
  formatGermanTimestamp,
  type HomeTask,
} from "@/lib/home-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A document row with the fields needed by the home dashboard. */
export interface HomeDocument {
  id: string;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  status: string;
  created_at: string;
}

/** A family member row for the greeting area. */
export interface HomeMember {
  id: string;
  name: string;
  role: string | null;
  avatar_color: string | null;
}

/** Props for the HomeClient component. */
export interface HomeClientProps {
  familyName: string;
  members: HomeMember[];
  analyzedDocuments: HomeDocument[];
  upcomingTasks: HomeTask[];
  recentDocuments: HomeDocument[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Home dashboard client component.
 *
 * Renders the Home dashboard with:
 * - AI search bar at top (navigates to /suche?q=… on submit)
 * - Family greeting with member avatars
 * - "Heute wichtig" section (urgent tasks, due within 7 days)
 * - "Neue Dokumente zur Bestätigung" section (analyzed documents)
 * - "Fristen" section (upcoming deadlines sorted by due date)
 * - "Zuletzt gescannt" section (recent documents with German timestamp)
 * - Warm empty states for each section when no data
 *
 * All UI text is in German. Data is fetched server-side and passed as props.
 * Task toggling uses the browser Supabase client + router.refresh() for
 * cross-area state consistency.
 */
export function HomeClient({
  familyName,
  members,
  analyzedDocuments,
  upcomingTasks,
  recentDocuments,
}: HomeClientProps) {
  const router = useRouter();
  const supabase = createClient();

  // Local state for optimistic task updates (so toggling a task is
  // immediately reflected without waiting for the server refresh).
  const [localTasks, setLocalTasks] = useState<HomeTask[]>(upcomingTasks);

  // -------------------------------------------------------------------------
  // Search bar submission — navigate to /suche with the query
  // -------------------------------------------------------------------------

  const handleSearch = useCallback(
    (query: string) => {
      router.push(`/suche?q=${encodeURIComponent(query)}`);
    },
    [router],
  );

  // -------------------------------------------------------------------------
  // Task toggling — optimistic update + DB update + router.refresh()
  // -------------------------------------------------------------------------

  const handleToggleDone = useCallback(
    async (taskId: string, newStatus: string) => {
      // Optimistic update: immediately reflect the change locally.
      setLocalTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t,
        ),
      );

      try {
        const { error } = await supabase
          .from("tasks")
          .update({ status: newStatus })
          .eq("id", taskId);

        if (error) {
          // Revert on failure.
          setLocalTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, status: newStatus === "done" ? "open" : "done" }
                : t,
            ),
          );
        }
        // Refresh server data so all sections reflect the new state
        // (VAL-CROSS-010: task leaves "Heute wichtig" when marked done).
        router.refresh();
      } catch {
        // Revert on exception.
        setLocalTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: newStatus === "done" ? "open" : "done" }
              : t,
          ),
        );
      }
    },
    [supabase, router],
  );

  // -------------------------------------------------------------------------
  // Derived data — filter tasks for each section
  // -------------------------------------------------------------------------

  const heuteWichtig = filterHeuteWichtig(localTasks);
  const fristen = filterFristen(localTasks);

  // Convert HomeTask to TaskCardData for TaskCard rendering.
  const toTaskCardData = (t: HomeTask): TaskCardData => ({
    id: t.id,
    family_id: t.family_id,
    document_id: t.document_id,
    title: t.title,
    due_date: t.due_date,
    priority: t.priority,
    status: t.status,
    confidence: t.confidence,
    confirmed: t.confirmed,
    created_at: t.created_at,
    document_title: t.document_title ?? null,
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* AI Search Bar — prominent at top */}
      <AISearchBar
        onSubmit={handleSearch}
        placeholder="Frage Ordilo oder suche nach Dokumenten…"
      />

      {/* Family greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {familyName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {members.length}{" "}
            {members.length === 1
              ? "Familienmitglied"
              : "Familienmitglieder"}
          </p>
        </div>
        {/* Member avatars */}
        {members.length > 0 && (
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m) => (
              <div
                key={m.id}
                className="flex size-9 items-center justify-center rounded-full border-2 border-background text-xs font-semibold text-white"
                style={{
                  backgroundColor: m.avatar_color ?? "var(--petrol)",
                }}
                title={m.name}
                aria-label={m.name}
              >
                {m.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member names (visible text for VAL-CROSS-001) */}
      {members.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="member-list">
          {members.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-ordilo-pill bg-card px-3 py-1 text-sm text-foreground shadow-card"
            >
              <span
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: m.avatar_color ?? "var(--petrol)",
                }}
                aria-hidden="true"
              />
              {m.name}
            </span>
          ))}
        </div>
      )}

      {/* Heute wichtig section */}
      <HomeSection
        testId="home-section-heute-wichtig"
        icon={CalendarClock}
        title="Heute wichtig"
      >
        {heuteWichtig.length > 0 ? (
          <div className="space-y-3">
            {heuteWichtig.map((task) => (
              <TaskCard
                key={task.id}
                task={toTaskCardData(task)}
                onToggleDone={(newStatus) =>
                  handleToggleDone(task.id, newStatus)
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nichts Dringendes"
            description="Du hast aktuell keine dringenden Aufgaben. Scanne ein Dokument, um Fristen zu erkennen."
            icon={CalendarClock}
          />
        )}
      </HomeSection>

      {/* Neue Dokumente zur Bestätigung section */}
      <HomeSection
        testId="home-section-review-docs"
        icon={FileCheck}
        title="Neue Dokumente zur Bestätigung"
      >
        {analyzedDocuments.length > 0 ? (
          <div className="space-y-3">
            {analyzedDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/scan?doc=${doc.id}`}
                className="block"
              >
                <DocumentCard
                  title={doc.title}
                  originalFilename={doc.original_filename}
                  mimeType={doc.mime_type}
                  status={doc.status}
                  createdAt={doc.created_at}
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Keine neuen Dokumente"
            description="Alle Dokumente sind bestätigt. Scanne ein neues Dokument, um es zu überprüfen."
            icon={FileCheck}
          />
        )}
      </HomeSection>

      {/* Fristen section */}
      <HomeSection
        testId="home-section-fristen"
        icon={CalendarDays}
        title="Fristen"
      >
        {fristen.length > 0 ? (
          <div className="space-y-3">
            {fristen.map((task) => (
              <TaskCard
                key={task.id}
                task={toTaskCardData(task)}
                onToggleDone={(newStatus) =>
                  handleToggleDone(task.id, newStatus)
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Keine anstehenden Fristen"
            description="Es sind keine offenen Fristen vorhanden."
            icon={CalendarDays}
          />
        )}
      </HomeSection>

      {/* Zuletzt gescannt section */}
      <HomeSection
        testId="home-section-recent-docs"
        icon={Clock}
        title="Zuletzt gescannt"
      >
        {recentDocuments.length > 0 ? (
          <div className="space-y-3">
            {recentDocuments.map((doc) => (
              <RecentDocCard key={doc.id} doc={doc} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Noch keine Dokumente"
            description="Scanne dein erstes Dokument — Ordilo hilft dir beim Sortieren und Finden."
            icon={ScanLine}
            actionLabel="Dokument scannen"
            onAction={() => router.push("/scan")}
          />
        )}
      </HomeSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A dashboard section with a heading, icon, and content area.
 */
function HomeSection({
  testId,
  icon: Icon,
  title,
  children,
}: {
  testId: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon
          className="size-5"
          style={{ color: "var(--petrol)" }}
          strokeWidth={2}
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * A recent document card with title and German timestamp.
 * Navigates to the document detail on click.
 */
function RecentDocCard({ doc }: { doc: HomeDocument }) {
  const timestamp = formatGermanTimestamp(doc.created_at);
  const displayTitle = doc.title?.trim() || doc.original_filename || "Dokument";

  return (
    <Link
      href={`/scan?doc=${doc.id}`}
      className="block"
      data-testid="recent-doc-card"
    >
      <div className="flex items-center gap-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card transition-all hover:shadow-card-hover">
        {/* File icon */}
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <FileCheck
            className="size-6"
            style={{ color: "var(--mist-dark)" }}
            strokeWidth={1.5}
          />
        </div>

        {/* Title + timestamp */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{displayTitle}</p>
          {timestamp && (
            <p className="truncate text-sm text-muted-foreground">{timestamp}</p>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
