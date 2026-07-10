"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TaskCardData } from "@/components/ordilo/task-card";
import { SwipeableTaskCard } from "@/components/ordilo/swipeable-task-card";
import { TaskDetailSheet } from "@/components/ordilo/task-detail-sheet";
import { EmptyState } from "@/components/ordilo/empty-state";
import { Button } from "@/components/ui/button";
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

const now = new Date();
const in7Days = new Date();
in7Days.setDate(now.getDate() + 7);
const nowStr = now.toISOString().split("T")[0];
const in7DaysStr = in7Days.toISOString().split("T")[0];

const COLUMNS: ColumnConfig[] = [
  {
    id: "overdue",
    label: "Überfällig",
    dot: "bg-[var(--warm-apricot)]",
    filter: (t) =>
      t.status === "open" &&
      t.due_date !== null &&
      t.due_date < nowStr,
    emptyText: "Puh, nichts überfällig",
  },
  {
    id: "this-week",
    label: "Diese Woche",
    dot: "bg-[var(--petrol)]",
    filter: (t) =>
      t.status === "open" &&
      t.due_date !== null &&
      t.due_date >= nowStr &&
      t.due_date <= in7DaysStr,
    emptyText: "Nichts drängt",
  },
  {
    id: "later",
    label: "Später",
    dot: "bg-[var(--mist)]",
    filter: (t) =>
      t.status === "open" &&
      (t.due_date === null || t.due_date > in7DaysStr),
    emptyText: "Ruhige Aussichten",
  },
  {
    id: "done",
    label: "Erledigt",
    dot: "bg-[var(--petrol)]",
    filter: (t) => t.status === "done",
    emptyText: "Noch nichts geschafft",
  },
];

function BoardColumn({
  column,
  tasks,
  onToggleDone,
  onDismiss,
  onCardClick,
  onEdit,
  onDelete,
  onDrop,
}: {
  column: ColumnConfig;
  tasks: TaskCardData[];
  onToggleDone: (taskId: string, newStatus: string) => void;
  onDismiss: (taskId: string) => void;
  onCardClick: (task: TaskCardData) => void;
  onEdit: (task: TaskCardData) => void;
  onDelete: (taskId: string) => void;
  onDrop: (taskId: string, targetColumnId: string) => void;
}) {
  const sortedTasks = useMemo(
    () => sortTasksByPriorityAndDate(tasks),
    [tasks],
  );

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onDrop(taskId, column.id);
    }
  }, [column.id, onDrop]);

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
        <span className="text-xs tabular-nums text-muted-foreground/40">
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
            />
          ))
        ) : (
          <p
            className="px-1 py-2 text-xs text-muted-foreground/30"
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
  initialError = null,
}: {
  initialTasks: TaskCardData[];
  initialError?: string | null;
}) {
  const router = useRouter();
  const { openWizard } = useScanActions();
  const [tasks, setTasks] = useState<TaskCardData[]>(initialTasks);
  const [error] = useState<string | null>(initialError);
  const [selectedTask, setSelectedTask] = useState<TaskCardData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
    (taskId: string, newStatus: string) => {
      if (newStatus === "done") {
        toast.success("Erledigt — gut gemacht!");
      } else {
        toast.success("Wieder geöffnet");
      }
      toggleDone(taskId, newStatus);
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, status: newStatus } : prev,
      );
    },
    [toggleDone],
  );

  const handleDismiss = useCallback(
    (taskId: string) => {
      toast.success("Verworfen — weg damit");
      dismiss(taskId);
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

  const handleDrop = useCallback(
    (taskId: string, targetColumnId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const newStatus = targetColumnId === "done" ? "done" : "open";
      if (task.status === newStatus) return;

      if (newStatus === "done") {
        toast.success("Erledigt — gut gemacht!");
      } else {
        toast.success("Wieder geöffnet");
      }
      toggleDone(taskId, newStatus);
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, status: newStatus } : prev,
      );
    },
    [tasks, toggleDone],
  );

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.status !== "dismissed"),
    [tasks],
  );

  const columnTasks = useMemo(() => {
    const groups: Record<string, TaskCardData[]> = {};
    for (const col of COLUMNS) {
      groups[col.id] = visibleTasks.filter(col.filter);
    }
    return groups;
  }, [visibleTasks]);

  const hasAnyTasks = tasks.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold text-foreground">Aufgaben</h1>
        {visibleTasks.length > 0 && (
          <span className="text-xs text-muted-foreground/50">
            {visibleTasks.filter((t) => t.status === "open").length} offen · {visibleTasks.filter((t) => t.status === "done").length} erledigt
          </span>
        )}
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
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={columnTasks[col.id]}
              onToggleDone={handleToggleDone}
              onDismiss={handleDismiss}
              onCardClick={handleCardClick}
              onEdit={handleCardClick}
              onDelete={(taskId) => setDeleteConfirmId(taskId)}
              onDrop={handleDrop}
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
      />

      <Sheet
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <SheetContent side="bottom" data-testid="task-delete-confirm-sheet">
          <SheetHeader>
            <SheetTitle>Aufgabe löschen?</SheetTitle>
            <SheetDescription>
              Die Aufgabe wird für immer entfernt. Das lässt sich nicht rückgängig machen.
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
              onClick={() => {
                if (!deleteConfirmId) return;
                handleDismiss(deleteConfirmId);
                setDeleteConfirmId(null);
                toast.success("Gelöscht");
              }}
              data-testid="confirm-delete-task-button"
            >
              Löschen
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
