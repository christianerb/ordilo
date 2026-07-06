"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import {
  TASK_FILTER_LABELS,
  filterTasksByStatus,
  sortTasksByPriorityAndDate,
  type TaskStatusFilter,
} from "@/lib/task-utils";
import type { Database } from "@/types/database";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskDBRow = Database["public"]["Tables"]["tasks"]["Row"];
type DocumentDBRow = Database["public"]["Tables"]["documents"]["Row"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Aufgaben page — the Tasks tab at /aufgaben.
 *
 * Features:
 * - Shows all confirmed family tasks as task cards
 * - Filter by status: Offen, Erledigt, Alle (segmented control)
 * - Mark task as done (checkbox toggle, persists to DB)
 * - Reopen a completed task (toggle back to open)
 * - Dismiss task (sets status to dismissed)
 * - Task card links to source document (/scan?doc=ID)
 * - Empty state when no tasks
 * - German throughout
 * - Mobile-friendly
 *
 * Data flow:
 * - Fetches the user's family ID from the families table
 * - Fetches confirmed tasks (confirmed = true) for the family
 * - Fetches document titles for the source-document links
 * - Updates task status directly via the browser Supabase client (RLS-protected)
 */
export default function AufgabenPage() {
  const supabase = createClient();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatusFilter>("open");

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Get the user's family ID.
      const { data: family, error: familyError } = await supabase
        .from("families")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (familyError || !family) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // 2. Fetch confirmed tasks for the family.
      // Only confirmed tasks (from document confirm flow) are shown in the
      // Aufgaben tab. Unconfirmed tasks are part of the review card flow.
      const { data: taskRows, error: tasksError } = await supabase
        .from("tasks")
        .select("*")
        .eq("family_id", family.id)
        .eq("confirmed", true)
        .order("created_at", { ascending: false });

      if (tasksError) {
        setError("Aufgaben konnten nicht geladen werden.");
        setLoading(false);
        return;
      }

      if (!taskRows || taskRows.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // 3. Fetch document titles for the source-document links.
      const documentIds = [...new Set(taskRows.map((t) => t.document_id))];
      const { data: docRows, error: docsError } = await supabase
        .from("documents")
        .select("id, title, original_filename")
        .in("id", documentIds);

      // Build a lookup map for document titles (best-effort — if the fetch
      // fails, task cards still render without document links).
      const docMap = new Map<string, string | null>();
      if (!docsError && docRows) {
        for (const doc of docRows as DocumentDBRow[]) {
          docMap.set(doc.id, doc.title);
        }
      }

      // 4. Merge task rows with document titles.
      const enriched: TaskCardData[] = (taskRows as TaskDBRow[]).map((task) => ({
        ...task,
        document_title: docMap.get(task.document_id) ?? null,
      }));

      setTasks(enriched);
    } catch {
      setError("Etwas ist schiefgelaufen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /**
   * Toggle a task's status between "open" and "done".
   * Persists to the database via the browser Supabase client (RLS-protected).
   */
  const handleToggleDone = useCallback(
    async (taskId: string, newStatus: string) => {
      // Optimistic update: immediately reflect the change in the UI.
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t,
        ),
      );

      try {
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ status: newStatus })
          .eq("id", taskId);

        if (updateError) {
          // Revert on failure.
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, status: newStatus === "done" ? "open" : "done" }
                : t,
            ),
          );
          setError("Aufgabe konnte nicht aktualisiert werden.");
        }
      } catch {
        // Revert on exception.
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: newStatus === "done" ? "open" : "done" }
              : t,
          ),
        );
        setError("Etwas ist schiefgelaufen. Bitte erneut versuchen.");
      }
    },
    [supabase],
  );

  /**
   * Dismiss a task (set status to "dismissed").
   * Persists to the database via the browser Supabase client (RLS-protected).
   */
  const handleDismiss = useCallback(
    async (taskId: string) => {
      // Optimistic update.
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "dismissed" } : t,
        ),
      );

      try {
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ status: "dismissed" })
          .eq("id", taskId);

        if (updateError) {
          // Revert on failure.
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, status: "open" } : t,
            ),
          );
          setError("Aufgabe konnte nicht verworfen werden.");
        }
      } catch {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: "open" } : t,
          ),
        );
        setError("Etwas ist schiefgelaufen. Bitte erneut versuchen.");
      }
    },
    [supabase],
  );

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const filteredTasks = sortTasksByPriorityAndDate(
    filterTasksByStatus(tasks, filter),
  );

  const hasAnyTasks = tasks.length > 0;
  const hasFilteredTasks = filteredTasks.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Page header */}
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Aufgaben
      </h1>

      {/* Status filter — segmented control */}
      {hasAnyTasks && (
        <div
          role="tablist"
          aria-label="Aufgaben filtern"
          className="flex gap-1 rounded-ordilo-md border border-border bg-card p-1"
          data-testid="task-filter"
        >
          {(Object.keys(TASK_FILTER_LABELS) as TaskStatusFilter[]).map(
            (key) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "flex-1 rounded-ordilo-sm px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  filter === key
                    ? "bg-[var(--petrol)] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`task-filter-${key}`}
                data-active={filter === key}
              >
                {TASK_FILTER_LABELS[key]}
              </button>
            ),
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          className="rounded-ordilo-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
          data-testid="task-error"
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          className="flex items-center justify-center py-12"
          data-testid="task-loading"
        >
          <Loader2
            className="size-6 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Empty state — no tasks at all */}
      {!loading && !hasAnyTasks && (
        <EmptyState
          title="Noch keine Aufgaben"
          description="Scanne ein Dokument, damit Ordilo automatisch Aufgaben und Fristen für dich erkennt."
          icon={ListTodo}
          actionLabel="Dokument scannen"
          onAction={() => router.push("/scan")}
        />
      )}

      {/* Empty state — no tasks match the current filter */}
      {!loading && hasAnyTasks && !hasFilteredTasks && (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          data-testid="task-filter-empty"
        >
          <p className="text-sm text-muted-foreground">
            Keine Aufgaben in diesem Filter.
          </p>
        </div>
      )}

      {/* Task list */}
      {!loading && hasFilteredTasks && (
        <div className="space-y-3" data-testid="task-list">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggleDone={(newStatus) => handleToggleDone(task.id, newStatus)}
              onDismiss={() => handleDismiss(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
