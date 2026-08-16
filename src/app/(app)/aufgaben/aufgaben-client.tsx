"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ListChecks, UserPlus } from "lucide-react";
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
import { SwipeableTaskCard } from "@/components/ordilo/swipeable-task-card";
import { MemberAvatar } from "@/components/ordilo/member-avatar";
import { TaskDetailSheet } from "@/components/ordilo/task-detail-sheet";
import { TaskCreateSheet } from "@/components/ordilo/task-create-sheet";
import { TaskScheduleSheet } from "@/components/ordilo/task-schedule-sheet";
import { TaskAssignSheet } from "@/components/ordilo/task-assign-sheet";
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
  formatTaskDayHint,
  getTaskSection,
  sortTasksByDate,
  todayLocalDate,
  type TaskSectionId,
} from "@/lib/task-utils";
import { useScanActions } from "@/lib/scan/scan-context";
import { createClient } from "@/lib/supabase/client";
import { useTaskMutation, type TaskPatch } from "@/lib/hooks/use-task-mutation";
import { cn } from "@/lib/utils";

interface SectionConfig {
  id: TaskSectionId;
  label: string;
  /** Heading color — urgency read at a glance, top to bottom. */
  tone: string;
  /** Collapsed by default, with a peek at the first few tasks. */
  collapsible?: boolean;
  /** How many rows a collapsed section shows before "+ N weitere". */
  peek?: number;
}

/**
 * The list's sections, in the order a family reads them.
 *
 * Three open sections instead of the previous five. The old split
 * (Überfällig / Heute / Diese Woche / Später / Erledigt) existed to give
 * drag-and-drop five places to drop a row into; with the gesture gone, the
 * sections only have to answer questions people actually ask. Notably,
 * "Ohne Termin" is now its own honest section — it used to hide inside a
 * collapsed "Später" together with far-future tasks, which turned every
 * undated task into an invisible backlog.
 */
const SECTIONS: SectionConfig[] = [
  { id: "now", label: "Jetzt dran", tone: "text-[var(--petrol)]" },
  { id: "next", label: "Als Nächstes", tone: "text-[var(--petrol)]" },
  {
    id: "undated",
    label: "Ohne Termin",
    tone: "text-[var(--mist-dark)]",
    collapsible: true,
    peek: 3,
  },
  {
    id: "done",
    label: "Erledigt",
    tone: "text-muted-foreground",
    collapsible: true,
    peek: 0,
  },
];

/** The sentinel member filter for "tasks nobody has taken on yet". */
const UNASSIGNED = "__unassigned__";

/**
 * Who a task belongs to, as the row should show them right now.
 *
 * The live `members` list wins over the `assigned_member_name` the server
 * sent: reassigning a task updates `assigned_to` optimistically but cannot
 * update a name resolved on the server, so trusting that name first showed
 * the new person's face next to the old person's name.
 */
function resolveAssignee(
  task: TaskCardData,
  members: AssigneeOption[],
  memberPhotoUrls: Record<string, string>,
) {
  if (!task.assigned_to) return undefined;
  const member = members.find((m) => m.id === task.assigned_to);
  return {
    name: member?.name ?? task.assigned_member_name ?? null,
    color: member?.avatar_color,
    photoUrl: memberPhotoUrls[task.assigned_to],
  };
}

/** A section's heading: a disclosure control only where there is one. */
function SectionHeading({
  section,
  count,
  expanded,
  onToggle,
}: {
  section: SectionConfig;
  count: number;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <h2 className={cn("text-base font-semibold", section.tone)}>
        {section.label}
      </h2>
      <span className="rounded-full bg-[var(--sand-warm)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--mist-dark)]">
        {count}
      </span>
      {onToggle && (
        <ChevronDown
          className={cn(
            "ml-auto size-4.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      )}
    </>
  );

  if (!onToggle) {
    return (
      <div
        className="flex w-full items-center gap-2 px-1 py-2"
        data-testid={`task-section-header-${section.id}`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center gap-2 rounded-ordilo-sm px-1 py-2 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      data-testid={`task-section-header-${section.id}`}
    >
      {content}
    </button>
  );
}

function TaskSection({
  section,
  tasks,
  members,
  memberPhotoUrls,
  onToggleDone,
  onDismiss,
  onCardClick,
  onEdit,
  onDelete,
  onSchedule,
  onAssign,
  deleteLabel,
}: {
  section: SectionConfig;
  tasks: TaskCardData[];
  members: AssigneeOption[];
  memberPhotoUrls: Record<string, string>;
  onToggleDone: (taskId: string, newStatus: string) => void;
  onDismiss: (taskId: string) => void;
  onCardClick: (task: TaskCardData) => void;
  onEdit: (task: TaskCardData) => void;
  onDelete: (taskId: string) => void;
  onSchedule: (task: TaskCardData) => void;
  onAssign: (task: TaskCardData) => void;
  deleteLabel?: string;
}) {
  // Open sections read by date; "Erledigt" keeps the incoming order, which
  // is newest-created first. Ordering finished work by the date it *was*
  // due puts the oldest chore on top of a list people scan for what they
  // just ticked off.
  const sortedTasks = useMemo(
    () => (section.id === "done" ? tasks : sortTasksByDate(tasks)),
    [section.id, tasks],
  );
  const [expanded, setExpanded] = useState(false);

  // A section is a heading, nothing more — it is not a drop target, so an
  // empty one has no reason to hold space.
  if (sortedTasks.length === 0) return null;

  const collapsed = Boolean(section.collapsible) && !expanded;
  const peek = section.peek ?? 0;
  const visibleTasks = collapsed ? sortedTasks.slice(0, peek) : sortedTasks;
  const hiddenCount = sortedTasks.length - visibleTasks.length;

  return (
    <section
      className="animate-column-in rounded-ordilo-md"
      data-testid={`task-section-${section.id}`}
    >
      {/* Only a collapsible section is a control. A heading rendered as a
          button that toggles nothing announces itself as interactive to a
          screen reader and then does nothing. */}
      <SectionHeading
        section={section}
        count={sortedTasks.length}
        expanded={expanded}
        onToggle={
          section.collapsible ? () => setExpanded((open) => !open) : undefined
        }
      />

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
            assignee={resolveAssignee(task, members, memberPhotoUrls)}
            flat
            cardClassName="px-3"
            onToggleDone={(newStatus) => onToggleDone(task.id, newStatus)}
            onDismiss={() => onDismiss(task.id)}
            onSchedule={
              task.status === "open" ? () => onSchedule(task) : undefined
            }
            onAssign={members.length > 0 ? () => onAssign(task) : undefined}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task.id)}
            onClick={() => onCardClick(task)}
            showConfidence={false}
            deleteLabel={deleteLabel}
          />
        ))}

        {hiddenCount > 0 && peek > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid={`task-section-expand-${section.id}`}
          >
            <span>
              + {hiddenCount} weitere{" "}
              {hiddenCount === 1 ? "Aufgabe" : "Aufgaben"}
            </span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
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
  const supabase = createClient();
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
  // The two quick sheets a row can open. Held as ids, not task objects, so
  // an optimistic update is reflected in the open sheet straight away.
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);

  /**
   * Whose tasks are shown: a member id, {@link UNASSIGNED}, or null for the
   * whole family. One filter instead of the previous member-filter-plus-
   * hidden-panel pair — "noch niemandem zugeordnet" was buried behind a
   * slider icon, which is a strange place for the one query a family plan
   * exists to answer.
   */
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  // The page header's "Neue Aufgabe" button opens this view's create sheet
  // via the planner actions context (registered on mount, cleared on
  // unmount — only one tab view is mounted at a time).
  const plannerActions = usePlannerActionsOptional();
  useMountEffect(() => {
    if (!familyId) return;
    plannerActions?.setCreateHandler(() => setCreateSheetOpen(true));
    return () => plannerActions?.setCreateHandler(null);
  });

  /**
   * Re-read the family's tasks from the server.
   *
   * Merges into local state instead of calling `router.refresh()`, because
   * the page keys this component on its task data — a refresh would remount
   * it and throw away the member filter, the expanded sections and any open
   * sheet every time somebody else ticked something off.
   */
  const refreshTasks = useCallback(async () => {
    if (!familyId) return;
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("*")
      .eq("family_id", familyId)
      .eq("confirmed", true)
      .order("created_at", { ascending: false });
    if (!taskRows) return;

    const documentIds = [
      ...new Set(
        taskRows
          .map((task) => task.document_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const titleById = new Map<string, string | null>();
    if (documentIds.length > 0) {
      const { data: documentRows } = await supabase
        .from("documents")
        .select("id, title")
        .in("id", documentIds);
      for (const document of documentRows ?? []) {
        titleById.set(document.id, document.title);
      }
    }

    setTasks((previous) => {
      const previousById = new Map(previous.map((task) => [task.id, task]));
      return taskRows.map((row) => ({
        ...row,
        document_title: row.document_id
          ? titleById.get(row.document_id) ?? null
          : null,
        // Linked documents only appear inside the detail sheet, so they are
        // not worth a third round trip here — keep what the page loaded.
        linked_documents: previousById.get(row.id)?.linked_documents ?? [],
        // Resolved from the live members list by the row itself.
        assigned_member_name: null,
      }));
    });
  }, [familyId, supabase]);

  /**
   * Two parents, two phones, one list.
   *
   * The Kalender tab of this very page has been live since it shipped while
   * Aufgaben stayed request/response — so a task Karina ticked off stayed
   * open on Christian's phone until he navigated away and back. For a
   * family plan that is the difference between one shared list and two
   * private guesses.
   */
  useMountEffect(() => {
    if (!familyId) return;
    // Defensive: test mocks (and any non-realtime client) don't implement
    // channel(); the page then simply stays request/response.
    if (typeof supabase.channel !== "function") return;

    const channel = supabase
      .channel(`tasks-${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `family_id=eq.${familyId}`,
        },
        () => void refreshTasks(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  });

  // Fresh "today" on every render so the sections stay correct across long
  // sessions (a module-level date would freeze), and in the user's own
  // calendar day so sections and row labels always agree.
  const nowStr = todayLocalDate();

  const { toggleDone, dismiss, patch } = useTaskMutation({
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
    onToggleError: () =>
      toast.error("Speichern hat nicht geklappt — bitte nochmal versuchen"),
    onToggleException: () =>
      toast.error("Etwas ist schiefgelaufen. Bitte erneut versuchen."),
    onDismissError: () =>
      toast.error("Verwerfen hat nicht geklappt — bitte nochmal versuchen"),
    onDismissException: () =>
      toast.error("Etwas ist schiefgelaufen. Bitte erneut versuchen."),
    onOptimisticPatch: (taskId, updates) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      ),
    onRevertPatch: (taskId, previous) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...previous } : t)),
      ),
    onPatchError: () =>
      toast.error("Speichern hat nicht geklappt — bitte nochmal versuchen"),
  });

  /**
   * Apply a patch and offer to take it back.
   *
   * Every quick edit on this screen goes through here, so "Rückgängig" is
   * never an afterthought: a mis-swipe, a wrong day, or the wrong name
   * costs one tap to undo.
   */
  const patchWithUndo = useCallback(
    async (taskId: string, updates: TaskPatch, message: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      // Mirror exactly the fields being changed, so undo restores those and
      // touches nothing else.
      const previous: TaskPatch = {};
      if ("status" in updates) previous.status = task.status;
      if ("due_date" in updates) previous.due_date = task.due_date;
      if ("assigned_to" in updates) previous.assigned_to = task.assigned_to;
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, ...updates } : prev,
      );
      const ok = await patch(taskId, updates, previous);
      if (!ok) return;
      toast.success(message, {
        action: {
          label: "Rückgängig",
          onClick: () => {
            setSelectedTask((prev) =>
              prev && prev.id === taskId ? { ...prev, ...previous } : prev,
            );
            void patch(taskId, previous, updates).then((reverted) => {
              if (reverted) toast.success("Rückgängig gemacht");
            });
          },
        },
      });
    },
    [patch, tasks],
  );

  const handleToggleDone = useCallback(
    async (taskId: string, newStatus: string) => {
      // Optimistically update the selected task for immediate feedback.
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, status: newStatus } : prev,
      );
      const ok = await toggleDone(taskId, newStatus);
      if (!ok) return;
      if (newStatus !== "done") {
        toast.success("Wieder geöffnet — kein Problem");
        return;
      }
      // Completing is the most repeated action here and the easiest to do
      // by accident with a swipe, so it is the one that most needs an undo.
      toast.success("Erledigt — gut gemacht!", {
        action: {
          label: "Rückgängig",
          onClick: () => {
            setSelectedTask((prev) =>
              prev && prev.id === taskId ? { ...prev, status: "open" } : prev,
            );
            void toggleDone(taskId, "open");
          },
        },
      });
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

  /** Restore a dismissed task to its exact prior schedule. */
  const handleUndoDismiss = useCallback(
    async (task: TaskCardData) => {
      const ok = await patch(
        task.id,
        { status: "open", due_date: task.due_date },
        { status: "dismissed", due_date: task.due_date },
      );
      if (ok) {
        toast.success("Wieder da — kein Problem");
      }
    },
    [patch],
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

  /** Commit a new due date from the "Wann?" sheet. */
  const handleScheduleSelect = useCallback(
    (dueDate: string | null) => {
      if (!scheduleTaskId) return;
      const hint = formatTaskDayHint(dueDate);
      void patchWithUndo(
        scheduleTaskId,
        // Rescheduling an already-completed task reopens it: the family
        // just said when it is next due.
        { status: "open", due_date: dueDate },
        dueDate === null
          ? "Termin entfernt"
          : dueDate === nowStr
            ? "Für heute eingeplant"
            : `Verschoben auf ${hint}`,
      );
    },
    [nowStr, patchWithUndo, scheduleTaskId],
  );

  /** Commit a new assignee from the "Wer macht das?" sheet. */
  const handleAssignSelect = useCallback(
    (memberId: string | null) => {
      if (!assignTaskId) return;
      const name = members.find((m) => m.id === memberId)?.name;
      void patchWithUndo(
        assignTaskId,
        { assigned_to: memberId },
        name ? `Übernimmt ${name}` : "Zuweisung entfernt",
      );
    },
    [assignTaskId, members, patchWithUndo],
  );

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.status !== "dismissed"),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    if (!memberFilter) return visibleTasks;
    if (memberFilter === UNASSIGNED) {
      return visibleTasks.filter((task) => !task.assigned_to);
    }
    return visibleTasks.filter((task) => task.assigned_to === memberFilter);
  }, [visibleTasks, memberFilter]);

  const sectionedTasks = useMemo(() => {
    const sections: Record<string, TaskCardData[]> = {};
    for (const section of SECTIONS) sections[section.id] = [];
    for (const task of filteredTasks) {
      sections[getTaskSection(task, nowStr)].push(task);
    }
    return sections;
  }, [filteredTasks, nowStr]);

  /**
   * Open tasks per member, plus the unassigned pile.
   *
   * The chips carry these counts so "wer macht was" is answered by looking
   * at the row of faces — without filtering down to one person at a time
   * and losing sight of the rest of the family.
   */
  const openCountsByMember = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    let total = 0;
    for (const task of visibleTasks) {
      if (task.status !== "open") continue;
      total += 1;
      if (!task.assigned_to) {
        unassigned += 1;
        continue;
      }
      counts.set(task.assigned_to, (counts.get(task.assigned_to) ?? 0) + 1);
    }
    return { counts, unassigned, total };
  }, [visibleTasks]);

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
  const nothingMatchesFilter = hasAnyTasks && filteredTasks.length === 0;
  const scheduleTask = scheduleTaskId
    ? tasks.find((t) => t.id === scheduleTaskId) ?? null
    : null;
  const assignTask = assignTaskId
    ? tasks.find((t) => t.id === assignTaskId) ?? null
    : null;
  // Nothing open today, but the family still has a plan — worth saying out
  // loud, because an empty first section otherwise reads as a glitch.
  const nowIsClear =
    hasAnyTasks &&
    !nothingMatchesFilter &&
    sectionedTasks.now.length === 0 &&
    openCount > 0;
  // Everything done. Without this the screen is a single collapsed
  // "Erledigt" row, which looks like the list failed to load rather than
  // like the family finished.
  const allDone = hasAnyTasks && !nothingMatchesFilter && openCount === 0;

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
          <FilterChip
            active={!memberFilter}
            count={openCountsByMember.total}
            onClick={() => setMemberFilter(null)}
            testId="task-chip-all"
          >
            <ListChecks className="size-4 shrink-0" aria-hidden="true" />
            Alle
          </FilterChip>

          {members.map((member) => (
            <FilterChip
              key={member.id}
              active={memberFilter === member.id}
              count={openCountsByMember.counts.get(member.id) ?? 0}
              onClick={() =>
                setMemberFilter(memberFilter === member.id ? null : member.id)
              }
              testId={`task-chip-${member.id}`}
              className="py-1 pl-1.5"
            >
              <MemberAvatar
                name={member.name}
                color={member.avatar_color}
                photoUrl={memberPhotoUrls[member.id]}
                size="md"
              />
              <span className="max-w-28 truncate">{member.name}</span>
            </FilterChip>
          ))}

          {openCountsByMember.unassigned > 0 && (
            <FilterChip
              active={memberFilter === UNASSIGNED}
              count={openCountsByMember.unassigned}
              onClick={() =>
                setMemberFilter(
                  memberFilter === UNASSIGNED ? null : UNASSIGNED,
                )
              }
              testId="task-chip-unassigned"
            >
              <UserPlus className="size-4 shrink-0" aria-hidden="true" />
              Offen für alle
            </FilterChip>
          )}
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

      {nothingMatchesFilter && (
        <p
          className="rounded-ordilo-md border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card"
          data-testid="task-filter-empty"
        >
          Für diese Auswahl steht gerade nichts an.
        </p>
      )}

      {allDone && (
        <p
          className="rounded-ordilo-md border border-border bg-[var(--surface-story)] p-4 text-sm text-muted-foreground"
          data-testid="task-all-done"
        >
          Alles erledigt. Nichts steht mehr an — schön gemacht.
        </p>
      )}

      {nowIsClear && (
        <p
          className="rounded-ordilo-md border border-border bg-[var(--surface-story)] p-4 text-sm text-muted-foreground"
          data-testid="task-now-clear"
        >
          Für heute bist du durch. Der Rest hat Zeit.
        </p>
      )}

      {hasAnyTasks && (
        <div data-testid="task-board" className="space-y-3">
          {SECTIONS.map((section) => (
            <TaskSection
              key={section.id}
              section={section}
              tasks={sectionedTasks[section.id]}
              members={members}
              memberPhotoUrls={memberPhotoUrls}
              onToggleDone={handleToggleDone}
              onDismiss={handleDismiss}
              onCardClick={handleCardClick}
              onEdit={handleCardClick}
              onDelete={(taskId) => setDeleteConfirmId(taskId)}
              onSchedule={(task) => setScheduleTaskId(task.id)}
              onAssign={(task) => setAssignTaskId(task.id)}
              deleteLabel="Verwerfen"
            />
          ))}
        </div>
      )}

      <TaskScheduleSheet
        task={scheduleTask}
        // Driven by the resolved task, not the id: if the task disappears
        // while its sheet is open — dismissed on another phone — the sheet
        // closes instead of asking "wann?" about nothing.
        open={scheduleTask !== null}
        onOpenChange={(open) => {
          if (!open) setScheduleTaskId(null);
        }}
        onSelect={handleScheduleSelect}
      />

      <TaskAssignSheet
        task={assignTask}
        members={members}
        memberPhotoUrls={memberPhotoUrls}
        open={assignTask !== null}
        onOpenChange={(open) => {
          if (!open) setAssignTaskId(null);
        }}
        onSelect={handleAssignSelect}
      />

      <TaskDetailSheet
        key={selectedTask?.id ?? "none"}
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={handleSheetSaved}
        onToggleDone={handleToggleDone}
        onDismiss={handleDismiss}
        members={members}
        memberPhotoUrls={memberPhotoUrls}
      />

      {familyId && (
        <TaskCreateSheet
          // The sheet stays mounted, so its default assignee would be
          // frozen at whatever the filter was on first render. Remounting
          // on change is the codebase's reset-with-key convention.
          key={`create:${memberFilter ?? "all"}`}
          open={createSheetOpen}
          onOpenChange={setCreateSheetOpen}
          familyId={familyId}
          members={members}
          memberPhotoUrls={memberPhotoUrls}
          // Looking at one person's tasks and tapping "+" almost always
          // means "and one more for them".
          defaultAssignee={
            memberFilter && memberFilter !== UNASSIGNED ? memberFilter : null
          }
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

/**
 * One filter chip in the row of faces, with its open-task count.
 *
 * The count is the whole point: a chip row that only filters answers "show
 * me Karina's tasks", while a chip row with counts also answers "how is the
 * work spread across the family?" — without tapping anything.
 */
function FilterChip({
  active,
  count,
  onClick,
  testId,
  className,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "press-scale inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
          : "border-border bg-card text-foreground hover:bg-accent/40",
        className,
      )}
      data-testid={testId}
    >
      {children}
      <span
        className={cn(
          "min-w-4 text-xs tabular-nums",
          active ? "text-[var(--petrol)]" : "text-muted-foreground",
        )}
        data-testid={`${testId}-count`}
      >
        {count}
      </span>
    </button>
  );
}
