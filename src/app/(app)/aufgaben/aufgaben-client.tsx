"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ListChecks, SlidersHorizontal, X } from "lucide-react";
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
import { SwipeableTaskCard } from "@/components/ordilo/swipeable-task-card";
import { MemberAvatar } from "@/components/ordilo/member-avatar";
import { TaskDetailSheet } from "@/components/ordilo/task-detail-sheet";
import { TaskCreateSheet } from "@/components/ordilo/task-create-sheet";
import { EmptyState } from "@/components/ordilo/empty-state";
import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { useChangeEffect } from "@/lib/hooks/use-change-effect";
import { usePlannerActionsOptional } from "./planner-actions-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sortTasksByDate,
  getTaskDropUpdates,
  getTaskGroup,
  todayLocalDate,
  type TaskBoardColumnId,
  type TaskDropUpdates,
} from "@/lib/task-utils";
import { useScanActions } from "@/lib/scan/scan-context";
import { useTaskMutation } from "@/lib/hooks/use-task-mutation";
import { cn } from "@/lib/utils";

interface GroupConfig {
  id: TaskBoardColumnId;
  label: string;
  /** Heading color — urgency read at a glance, top to bottom. */
  tone: string;
  /** Row wash, for the one group that must not be missed. */
  rowSurface?: string;
  /** Collapsed by default, with a peek at the first few tasks. */
  collapsible?: boolean;
  /** How many rows a collapsed group shows before "+ N weitere". */
  peek?: number;
}

/**
 * The list's groups, in the order a family reads them: what slipped,
 * what is due today, what the week holds, what can wait, what is done.
 */
const GROUPS: GroupConfig[] = [
  {
    id: "overdue",
    label: "Überfällig",
    tone: "text-destructive",
    rowSurface: "bg-[color-mix(in_srgb,var(--destructive)_6%,var(--card))]",
  },
  { id: "today", label: "Heute", tone: "text-[var(--petrol)]" },
  { id: "this-week", label: "Diese Woche", tone: "text-[var(--petrol)]" },
  {
    id: "later",
    label: "Später",
    tone: "text-[var(--apricot-text)]",
    collapsible: true,
    peek: 3,
  },
  { id: "done", label: "Erledigt", tone: "text-muted-foreground", collapsible: true, peek: 0 },
];

/** Success toasts per drop target group (German UI copy). */
const DROP_SUCCESS_TOASTS: Record<TaskBoardColumnId, string> = {
  done: "Erledigt — gut gemacht!",
  today: "Für heute eingeplant",
  "this-week": "Für diese Woche eingeplant",
  later: "Auf später verschoben",
  overdue: "Als überfällig markiert",
};

/**
 * localStorage key for the one-time drag-and-drop hint. Versioned so a
 * future wording change can re-show the hint under a fresh key.
 */
const DRAG_HINT_STORAGE_KEY = "ordilo-board-drag-hint-v1";

function TaskGroup({
  group,
  tasks,
  members,
  memberPhotoUrls,
  canAcceptDrop,
  isTouchDragOver,
  justReceivedDrop,
  onToggleDone,
  onDismiss,
  onCardClick,
  onEdit,
  onDelete,
  onDrop,
  deleteLabel,
  onDragStateChange,
  onDragOverColumn,
}: {
  group: GroupConfig;
  tasks: TaskCardData[];
  members: AssigneeOption[];
  memberPhotoUrls: Record<string, string>;
  /** Whether this group can accept the currently-dragged task. */
  canAcceptDrop: boolean;
  /** Whether a touch drag is currently hovering this group. */
  isTouchDragOver?: boolean;
  /** Briefly confirms the task's new place after a successful drop. */
  justReceivedDrop?: boolean;
  onToggleDone: (taskId: string, newStatus: string) => void;
  onDismiss: (taskId: string) => void;
  onCardClick: (task: TaskCardData) => void;
  onEdit: (task: TaskCardData) => void;
  onDelete: (taskId: string) => void;
  onDrop: (taskId: string, targetColumnId: string) => void;
  deleteLabel?: string;
  onDragStateChange?: (taskId: string | null) => void;
  onDragOverColumn?: (columnId: string | null) => void;
}) {
  const sortedTasks = useMemo(() => sortTasksByDate(tasks), [tasks]);
  const [expanded, setExpanded] = useState(false);

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      e.preventDefault();
      dragCounter.current++;
      setIsDragOver(true);
    },
    [canAcceptDrop],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [canAcceptDrop],
  );

  const handleDragLeave = useCallback(() => {
    if (!canAcceptDrop) return;
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, [canAcceptDrop]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);
      const taskId = e.dataTransfer.getData("text/plain");
      if (taskId) {
        onDrop(taskId, group.id);
      }
    },
    [canAcceptDrop, group.id, onDrop],
  );

  const highlighted = isDragOver || (canAcceptDrop && isTouchDragOver);

  // An empty group is only worth its heading while something is being
  // dragged — then it is a landing place. Otherwise it stays out of the
  // way, so the list shows what there is instead of what there isn't.
  if (sortedTasks.length === 0 && !canAcceptDrop) return null;

  const collapsed = Boolean(group.collapsible) && !expanded;
  const peek = group.peek ?? 0;
  const visibleTasks = collapsed ? sortedTasks.slice(0, peek) : sortedTasks;
  const hiddenCount = sortedTasks.length - visibleTasks.length;

  return (
    <section
      className={cn(
        "animate-column-in rounded-ordilo-md transition-colors",
        highlighted && "bg-secondary/30",
        justReceivedDrop && "animate-board-settle",
      )}
      data-testid={`board-column-${group.id}`}
      data-column-id={group.id}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        onClick={() => group.collapsible && setExpanded((open) => !open)}
        aria-expanded={group.collapsible ? expanded : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-ordilo-sm px-1 py-2 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          !group.collapsible && "cursor-default",
        )}
        data-testid={`board-column-header-${group.id}`}
      >
        <h2 className={cn("text-base font-semibold", group.tone)}>
          {group.label}
        </h2>
        <span className="rounded-full bg-[var(--sand-warm)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--mist-dark)]">
          {sortedTasks.length}
        </span>
        {group.collapsible && (
          <ChevronDown
            className={cn(
              "ml-auto size-4.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        )}
      </button>

      <div
        className={cn(
          "overflow-hidden rounded-ordilo-md",
          sortedTasks.length > 0 && "divide-y divide-border/60",
        )}
      >
        {visibleTasks.map((task) => (
          <SwipeableTaskCard
            key={task.id}
            task={task}
            assignee={
              task.assigned_to
                ? {
                    name:
                      task.assigned_member_name ??
                      members.find((m) => m.id === task.assigned_to)?.name ??
                      null,
                    color: members.find((m) => m.id === task.assigned_to)
                      ?.avatar_color,
                    photoUrl: memberPhotoUrls[task.assigned_to],
                  }
                : undefined
            }
            flat
            cardClassName="px-3"
            surfaceClassName={group.rowSurface}
            onToggleDone={(newStatus) => onToggleDone(task.id, newStatus)}
            onDismiss={() => onDismiss(task.id)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task.id)}
            onClick={() => onCardClick(task)}
            showConfidence={false}
            deleteLabel={deleteLabel}
            onDragStateChange={onDragStateChange}
            onTaskDrop={onDrop}
            onDragOverColumn={onDragOverColumn}
          />
        ))}

        {hiddenCount > 0 && peek > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid={`board-column-expand-${group.id}`}
          >
            <span>
              + {hiddenCount} weitere {hiddenCount === 1 ? "Aufgabe" : "Aufgaben"}
            </span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
        )}

        {/* Drop placeholder — shows where the dragged task will land.
            Sorting is automatic (by date), so the placeholder sits at the
            end of the group rather than under the finger. */}
        {highlighted && (
          <div
            data-testid={`drop-placeholder-${group.id}`}
            aria-hidden="true"
            className="m-1 h-14 rounded-ordilo-sm border border-dashed border-[var(--petrol)]/50 bg-secondary/20"
          />
        )}
      </div>
    </section>
  );
}

export function AufgabenClient({
  initialTasks,
  members,
  memberPhotoUrls = {},
  familyId,
  initialError = null,
  openTaskId = null,
}: {
  initialTasks: TaskCardData[];
  members: AssigneeOption[];
  /** Signed avatar URLs by member id (photoless members show initials). */
  memberPhotoUrls?: Record<string, string>;
  familyId: string | null;
  initialError?: string | null;
  /** Deep link (/aufgaben?task=<id>): open this task's detail sheet once. */
  openTaskId?: string | null;
}) {
  const router = useRouter();
  const { openWizard } = useScanActions();
  const [tasks, setTasks] = useState<TaskCardData[]>(initialTasks);
  const [error] = useState<string | null>(initialError);
  // Deep link: /aufgaben?task=<id> preselects that task and opens its
  // detail sheet right away (the home hero's "Details" link targets this).
  const [selectedTask, setSelectedTask] = useState<TaskCardData | null>(
    () => initialTasks.find((t) => t.id === openTaskId) ?? null,
  );
  const [sheetOpen, setSheetOpen] = useState(() =>
    initialTasks.some((t) => t.id === openTaskId),
  );
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [settledColumnId, setSettledColumnId] = useState<string | null>(null);
  const [showDragHint, setShowDragHint] = useState(false);
  const settleTimer = useRef<number | null>(null);

  /** Member id whose tasks are shown, or null for the whole family. */
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // One-time drag-and-drop hint — read localStorage after mount (not
  // during render) to avoid a server/client hydration mismatch. Optional
  // chaining matches the codebase's defensive localStorage access (it can
  // be unavailable, e.g. in private browsing or test environments).
  useMountEffect(() => {
    setShowDragHint(!window.localStorage?.getItem(DRAG_HINT_STORAGE_KEY));
  });

  useMountEffect(() => () => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
    }
  });

  const dismissDragHint = useCallback(() => {
    window.localStorage?.setItem(DRAG_HINT_STORAGE_KEY, "dismissed");
    setShowDragHint(false);
  }, []);

  // The page header's "Neue Aufgabe" button opens this view's create sheet
  // via the planner actions context (registered on mount, cleared on
  // unmount — only one tab view is mounted at a time).
  const plannerActions = usePlannerActionsOptional();
  useMountEffect(() => {
    if (!familyId) return;
    plannerActions?.setCreateHandler(() => setCreateSheetOpen(true));
    return () => plannerActions?.setCreateHandler(null);
  });

  // Fresh "today" on every render so overdue/today/this-week groups stay
  // correct across long sessions (module-level dates would freeze), and
  // in the user's own calendar day so grouping and the row labels agree.
  const nowStr = todayLocalDate();

  const { toggleDone, dismiss, reschedule } = useTaskMutation({
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
    onOptimisticReschedule: (taskId, updates) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      ),
    onRevertReschedule: (taskId, previous) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...previous } : t)),
      ),
    onRescheduleError: () =>
      toast.error("Verschieben hat nicht geklappt — bitte nochmal versuchen"),
  });

  const handleToggleDone = useCallback(
    async (taskId: string, newStatus: string) => {
      // Optimistically update the selected task for immediate feedback.
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, status: newStatus } : prev,
      );
      const ok = await toggleDone(taskId, newStatus);
      if (ok) {
        toast.success(newStatus === "done" ? "Erledigt — gut gemacht!" : "Wieder geöffnet — kein Problem");
      }
    },
    [toggleDone],
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

  /** Revert a drop back to the task's previous schedule. */
  const handleUndoDrop = useCallback(
    async (taskId: string, current: TaskDropUpdates, previous: TaskDropUpdates) => {
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, ...previous } : prev,
      );
      const ok = await reschedule(taskId, previous, current);
      if (ok) {
        toast.success("Rückgängig gemacht");
      }
    },
    [reschedule],
  );

  /** Restore a dismissed task to its exact prior schedule. */
  const handleUndoDismiss = useCallback(
    async (task: TaskCardData) => {
      const dismissed: TaskDropUpdates = {
        status: "dismissed",
        due_date: task.due_date,
      };
      const restored: TaskDropUpdates = {
        status: "open",
        due_date: task.due_date,
      };
      const ok = await reschedule(task.id, restored, dismissed);
      if (ok) {
        toast.success("Wieder da — kein Problem");
      }
    },
    [reschedule],
  );

  const handleDismiss = useCallback(
    async (taskId: string) => {
      const task = tasks.find((item) => item.id === taskId);
      const ok = await dismiss(taskId);
      if (ok) {
        toast.success("Verworfen", {
          action: task
            ? {
                label: "Rückgängig",
                onClick: () => void handleUndoDismiss(task),
              }
            : undefined,
        });
      }
    },
    [dismiss, handleUndoDismiss, tasks],
  );

  const handleDrop = useCallback(
    async (taskId: string, targetColumnId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Dropping between open groups reschedules the due date; dropping
      // onto "Erledigt" completes the task. No-op when the task already
      // belongs to the target group.
      const updates = getTaskDropUpdates(
        task,
        targetColumnId as TaskBoardColumnId,
        nowStr,
      );
      if (!updates) return;

      const previous: TaskDropUpdates = {
        status: task.status,
        due_date: task.due_date,
      };
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, ...updates } : prev,
      );
      const ok = await reschedule(taskId, updates, previous);
      if (ok) {
        if (settleTimer.current !== null) {
          window.clearTimeout(settleTimer.current);
        }
        setSettledColumnId(targetColumnId);
        settleTimer.current = window.setTimeout(() => {
          setSettledColumnId(null);
          settleTimer.current = null;
        }, 450);
        toast.success(
          DROP_SUCCESS_TOASTS[targetColumnId as TaskBoardColumnId] ??
            "Verschoben",
          {
            action: {
              label: "Rückgängig",
              onClick: () => void handleUndoDrop(taskId, updates, previous),
            },
          },
        );
      }
    },
    [tasks, reschedule, nowStr, handleUndoDrop],
  );

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.status !== "dismissed"),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      if (memberFilter && task.assigned_to !== memberFilter) return false;
      if (unassignedOnly && task.assigned_to) return false;
      return true;
    });
  }, [visibleTasks, memberFilter, unassignedOnly]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, TaskCardData[]> = {};
    for (const group of GROUPS) groups[group.id] = [];
    for (const task of filteredTasks) {
      groups[getTaskGroup(task, nowStr)].push(task);
    }
    return groups;
  }, [filteredTasks, nowStr]);

  // Which group the dragged task currently sits in — every other group is
  // a valid drop target.
  const draggingGroupId = draggingTaskId
    ? (() => {
        const task = tasks.find((t) => t.id === draggingTaskId);
        return task ? getTaskGroup(task, nowStr) : null;
      })()
    : null;

  const openCount = useMemo(
    () => filteredTasks.filter((t) => t.status === "open").length,
    [filteredTasks],
  );

  // The page heading shows the live count ("17 offen"), so it keeps up
  // with a task ticked off here instead of waiting for a refresh.
  useChangeEffect(() => {
    plannerActions?.setOpenCount(openCount);
    return () => plannerActions?.setOpenCount(null);
  }, [openCount, plannerActions]);

  const hasAnyTasks = tasks.length > 0;
  const nothingMatchesFilter =
    hasAnyTasks && filteredTasks.length === 0;

  return (
    <div className="app-page-stack">
      {error && (
        <div
          className="rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
          data-testid="task-error"
        >
          {error}
        </div>
      )}

      {hasAnyTasks && (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-testid="task-member-chips"
        >
          <button
            type="button"
            onClick={() => {
              setMemberFilter(null);
              setUnassignedOnly(false);
            }}
            aria-pressed={!memberFilter && !unassignedOnly}
            className={cn(
              "press-scale inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              !memberFilter && !unassignedOnly
                ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            data-testid="task-chip-all"
          >
            <ListChecks className="size-4 shrink-0" aria-hidden="true" />
            Alle
          </button>

          {members.map((member) => {
            const active = memberFilter === member.id;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  setUnassignedOnly(false);
                  setMemberFilter(active ? null : member.id);
                }}
                aria-pressed={active}
                className={cn(
                  "press-scale inline-flex h-11 shrink-0 items-center gap-2 rounded-full border py-1 pr-4 pl-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                    : "border-border bg-card text-foreground hover:bg-accent/40",
                )}
                data-testid={`task-chip-${member.id}`}
              >
                <MemberAvatar
                  name={member.name}
                  color={member.avatar_color}
                  photoUrl={memberPhotoUrls[member.id]}
                  size="md"
                />
                <span className="max-w-28 truncate">{member.name}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreFiltersOpen((open) => !open)}
            aria-expanded={moreFiltersOpen}
            aria-label="Weitere Filter"
            title="Weitere Filter"
            className={cn(
              "ml-auto flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              moreFiltersOpen || unassignedOnly
                ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            data-testid="task-more-filters"
          >
            <SlidersHorizontal className="size-4.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {moreFiltersOpen && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-ordilo-md border border-border bg-card p-3 shadow-card"
          data-testid="task-filter-panel"
        >
          <button
            type="button"
            onClick={() => {
              setMemberFilter(null);
              setUnassignedOnly((only) => !only);
            }}
            aria-pressed={unassignedOnly}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              unassignedOnly
                ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                : "border-border bg-[var(--sand)] text-muted-foreground hover:text-foreground",
            )}
            data-testid="task-filter-unassigned"
          >
            Noch niemandem zugeordnet
          </button>
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

      {hasAnyTasks && showDragHint && (
        <div
          data-testid="board-drag-hint"
          className="flex items-center gap-2 rounded-ordilo-sm bg-secondary/20 px-3 py-2 text-xs text-muted-foreground [@media(pointer:fine)]:hidden"
        >
          <span className="flex-1">
            Tipp: Halte eine Aufgabe kurz gedrückt, um sie zu verschieben.
          </span>
          <button
            type="button"
            onClick={dismissDragHint}
            aria-label="Hinweis schließen"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {nothingMatchesFilter && (
        <p
          className="rounded-ordilo-md border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card"
          data-testid="task-filter-empty"
        >
          Für diese Auswahl steht gerade nichts an.
        </p>
      )}

      {hasAnyTasks && (
        <div data-testid="task-board" className="space-y-3">
          {GROUPS.map((group) => (
            <TaskGroup
              key={group.id}
              group={group}
              tasks={groupedTasks[group.id]}
              members={members}
              memberPhotoUrls={memberPhotoUrls}
              canAcceptDrop={
                draggingGroupId !== null && group.id !== draggingGroupId
              }
              isTouchDragOver={dragOverColumnId === group.id}
              justReceivedDrop={settledColumnId === group.id}
              onToggleDone={handleToggleDone}
              onDismiss={handleDismiss}
              onCardClick={handleCardClick}
              onEdit={handleCardClick}
              onDelete={(taskId) => setDeleteConfirmId(taskId)}
              onDrop={handleDrop}
              deleteLabel="Verwerfen"
              onDragStateChange={setDraggingTaskId}
              onDragOverColumn={setDragOverColumnId}
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

      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <DialogContent
          className="max-w-sm"
          data-testid="task-delete-confirm-dialog"
        >
          <DialogHeader>
            <DialogTitle>Aufgabe verwerfen?</DialogTitle>
            <DialogDescription>
              Die Aufgabe wird aus deiner Liste entfernt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 flex-row gap-3 sm:justify-end">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
