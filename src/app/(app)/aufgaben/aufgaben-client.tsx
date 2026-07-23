"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
import { SwipeableTaskCard } from "@/components/ordilo/swipeable-task-card";
import { TaskDetailSheet } from "@/components/ordilo/task-detail-sheet";
import { TaskCreateSheet } from "@/components/ordilo/task-create-sheet";
import { EmptyState } from "@/components/ordilo/empty-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { sortTasksByPriorityAndDate } from "@/lib/task-utils";
import { useScanActions } from "@/lib/scan/scan-context";
import { useTaskMutation } from "@/lib/hooks/use-task-mutation";
import { cn } from "@/lib/utils";

interface ColumnConfig {
  id: string;
  label: string;
  dot: string;
  filter: (task: TaskCardData) => boolean;
  emptyText: string;
}

/**
 * Static column definitions (without date-dependent filters). The filters
 * are attached inside the component so they use fresh "today" values on
 * every render instead of freezing at module-load time.
 */
const COLUMN_DEFS: Omit<ColumnConfig, "filter">[] = [
  { id: "overdue", label: "Überfällig", dot: "bg-[var(--warm-apricot)]", emptyText: "Puh, nichts überfällig" },
  { id: "this-week", label: "Diese Woche", dot: "bg-[var(--petrol)]", emptyText: "Nichts drängt" },
  { id: "later", label: "Später", dot: "bg-[var(--mist)]", emptyText: "Ruhige Aussichten" },
  { id: "done", label: "Erledigt", dot: "bg-[var(--petrol)]", emptyText: "Noch nichts geschafft" },
];

function BoardColumn({
  column,
  tasks,
  canAcceptDrop,
  onToggleDone,
  onDismiss,
  onCardClick,
  onEdit,
  onDelete,
  onDrop,
  deleteLabel,
  onDragStateChange,
}: {
  column: ColumnConfig;
  tasks: TaskCardData[];
  /** Whether this column can accept the currently-dragged task. */
  canAcceptDrop: boolean;
  onToggleDone: (taskId: string, newStatus: string) => void;
  onDismiss: (taskId: string) => void;
  onCardClick: (task: TaskCardData) => void;
  onEdit: (task: TaskCardData) => void;
  onDelete: (taskId: string) => void;
  onDrop: (taskId: string, targetColumnId: string) => void;
  deleteLabel?: string;
  onDragStateChange?: (taskId: string | null) => void;
}) {
  const sortedTasks = useMemo(
    () => sortTasksByPriorityAndDate(tasks),
    [tasks],
  );

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!canAcceptDrop) return;
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  }, [canAcceptDrop]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, [canAcceptDrop]);

  const handleDragLeave = useCallback(() => {
    if (!canAcceptDrop) return;
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, [canAcceptDrop]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!canAcceptDrop) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onDrop(taskId, column.id);
    }
  }, [canAcceptDrop, column.id, onDrop]);

  return (
    <div
      className={cn(
        "animate-column-in flex flex-col gap-2 rounded-ordilo-sm p-1 transition-colors",
        isDragOver && "bg-secondary/30",
      )}
      data-testid={`board-column-${column.id}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 px-1">
        <span
          className={cn("size-2 shrink-0 rounded-full", column.dot)}
          aria-hidden="true"
        />
        <h2 className="flex-1 text-sm font-medium text-foreground">
          {column.label}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div className="flex min-h-[3rem] flex-1 flex-col gap-2">
        {sortedTasks.length > 0 ? (
          sortedTasks.map((task) => (
            <SwipeableTaskCard
              key={task.id}
              task={task}
              onToggleDone={(newStatus) => onToggleDone(task.id, newStatus)}
              onDismiss={() => onDismiss(task.id)}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task.id)}
              onClick={() => onCardClick(task)}
              showConfidence={false}
              deleteLabel={deleteLabel}
              onDragStateChange={onDragStateChange}
            />
          ))
        ) : (
          <p
            className="px-1 py-2 text-xs text-muted-foreground"
            data-testid={`column-empty-${column.id}`}
          >
            {column.emptyText}
          </p>
        )}
      </div>
    </div>
  );
}

export function AufgabenClient({
  initialTasks,
  members,
  familyId,
  initialError = null,
}: {
  initialTasks: TaskCardData[];
  members: AssigneeOption[];
  familyId: string | null;
  initialError?: string | null;
}) {
  const router = useRouter();
  const { openWizard } = useScanActions();
  const [tasks, setTasks] = useState<TaskCardData[]>(initialTasks);
  const [error] = useState<string | null>(initialError);
  const [selectedTask, setSelectedTask] = useState<TaskCardData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Fresh "today" on every render so overdue/this-week buckets stay
  // correct across long sessions (module-level dates would freeze).
  const nowStr = new Date().toISOString().split("T")[0];
  const in7DaysStr = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .split("T")[0];

  const columns: ColumnConfig[] = COLUMN_DEFS.map((col) => ({
    ...col,
    filter:
      col.id === "overdue"
        ? (t: TaskCardData) =>
            t.status === "open" && t.due_date !== null && t.due_date < nowStr
        : col.id === "this-week"
          ? (t: TaskCardData) =>
              t.status === "open" &&
              t.due_date !== null &&
              t.due_date >= nowStr &&
              t.due_date <= in7DaysStr
          : col.id === "later"
            ? (t: TaskCardData) =>
                t.status === "open" &&
                (t.due_date === null || t.due_date > in7DaysStr)
            : (t: TaskCardData) => t.status === "done",
  }));

  const draggingTaskStatus = draggingTaskId
    ? tasks.find((t) => t.id === draggingTaskId)?.status
    : undefined;

  const { toggleDone, dismiss } = useTaskMutation({
    onOptimisticToggle: (taskId, newStatus) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      ),
    onRevertToggle: (taskId, newStatus) =>
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: newStatus === "done" ? "open" : "done" }
            : t,
        ),
      ),
    onOptimisticDismiss: (taskId) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "dismissed" } : t)),
      ),
    onRevertDismiss: (taskId) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "open" } : t)),
      ),
    onToggleError: () => toast.error("Speichern hat nicht geklappt — bitte nochmal versuchen"),
    onToggleException: () =>
      toast.error("Etwas ist schiefgelaufen. Bitte erneut versuchen."),
    onDismissError: () => toast.error("Verwerfen hat nicht geklappt — bitte nochmal versuchen"),
    onDismissException: () =>
      toast.error("Etwas ist schiefgelaufen. Bitte erneut versuchen."),
  });

  const handleToggleDone = useCallback(
    async (taskId: string, newStatus: string) => {
      // Optimistically update the selected task for immediate feedback.
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, status: newStatus } : prev,
      );
      const ok = await toggleDone(taskId, newStatus);
      if (ok) {
        toast.success(newStatus === "done" ? "Erledigt — gut gemacht!" : "Wieder geöffnet");
      }
    },
    [toggleDone],
  );

  const handleDismiss = useCallback(
    async (taskId: string) => {
      const ok = await dismiss(taskId);
      if (ok) {
        toast.success("Verworfen — weg damit");
      }
    },
    [dismiss],
  );

  const handleCardClick = useCallback((task: TaskCardData) => {
    setSelectedTask(task);
    setSheetOpen(true);
  }, []);

  const handleSheetSaved = useCallback(() => {
    toast.success("Gespeichert");
    router.refresh();
  }, [router]);

  const handleSheetCreated = useCallback(() => {
    toast.success("Aufgabe erstellt");
    router.refresh();
  }, [router]);

  const handleDrop = useCallback(
    async (taskId: string, targetColumnId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const newStatus = targetColumnId === "done" ? "done" : "open";
      if (task.status === newStatus) return;

      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, status: newStatus } : prev,
      );
      const ok = await toggleDone(taskId, newStatus);
      if (ok) {
        toast.success(newStatus === "done" ? "Erledigt — gut gemacht!" : "Wieder geöffnet");
      }
    },
    [tasks, toggleDone],
  );

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.status !== "dismissed"),
    [tasks],
  );

  const columnTasks = useMemo(() => {
    const groups: Record<string, TaskCardData[]> = {};
    for (const col of columns) {
      groups[col.id] = visibleTasks.filter(col.filter);
    }
    return groups;
  }, [visibleTasks, columns]);

  const hasAnyTasks = tasks.length > 0;

  return (
    <div className="app-page-stack">
      <div className="app-page-heading">
        <h1 className="text-lg font-semibold text-foreground">Aufgaben</h1>
        <div className="flex items-center gap-2">
          {visibleTasks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {visibleTasks.filter((t) => t.status === "open").length} offen · {visibleTasks.filter((t) => t.status === "done").length} erledigt
            </span>
          )}
          {familyId && (
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => setCreateSheetOpen(true)}
              data-testid="task-create-button"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Neue Aufgabe
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
          data-testid="task-error"
        >
          {error}
        </div>
      )}

      {!hasAnyTasks && (
        <EmptyState
          title="Nichts zu erledigen — wie schön"
          description="Scanne ein Dokument und Ordilo merkt sich automatisch, was ansteht. Du musst nie wieder Fristen im Kopf behalten."
          mascotMood="helping"
          actionLabel="Dokument scannen"
          onAction={openWizard}
        />
      )}

      {hasAnyTasks && (
        <div
          data-testid="task-board"
          className="space-y-4 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-4"
        >
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={columnTasks[col.id]}
              canAcceptDrop={
                draggingTaskStatus !== undefined &&
                (col.id === "done") !== (draggingTaskStatus === "done")
              }
              onToggleDone={handleToggleDone}
              onDismiss={handleDismiss}
              onCardClick={handleCardClick}
              onEdit={handleCardClick}
              onDelete={(taskId) => setDeleteConfirmId(taskId)}
              onDrop={handleDrop}
              deleteLabel="Verwerfen"
              onDragStateChange={setDraggingTaskId}
            />
          ))}
        </div>
      )}

      <TaskDetailSheet
        key={selectedTask?.id ?? "none"}
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={handleSheetSaved}
        onToggleDone={handleToggleDone}
        onDismiss={handleDismiss}
        members={members}
      />

      {familyId && (
        <TaskCreateSheet
          open={createSheetOpen}
          onOpenChange={setCreateSheetOpen}
          familyId={familyId}
          members={members}
          onCreated={handleSheetCreated}
        />
      )}

      <Sheet
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <SheetContent side="bottom" data-testid="task-delete-confirm-sheet">
          <SheetHeader>
            <SheetTitle>Aufgabe verwerfen?</SheetTitle>
            <SheetDescription>
              Die Aufgabe wird aus deiner Liste entfernt.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteConfirmId(null)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={async () => {
                if (!deleteConfirmId) return;
                const id = deleteConfirmId;
                setDeleteConfirmId(null);
                await handleDismiss(id);
              }}
              data-testid="confirm-delete-task-button"
            >
              Verwerfen
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
