import { useFocusEffect } from "expo-router";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Undo2,
} from "lucide-react-native";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated from "react-native-reanimated";

import { OrdiloSheet, type OrdiloSheetHandle } from "@/src/components/sheet";
import { TaskFormSheet, type TaskFormValues } from "@/src/components/task-form-sheet";
import {
  EmptyState,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
} from "@/src/components/ui";
import {
  fetchPlannerEvents,
  formatEventPeople,
  formatEventWhen,
  upcomingPlannerEvents,
  type PlannerEvent,
} from "@/src/lib/calendar";
import { useFamily } from "@/src/lib/family-context";
import { fail, select, success, tap } from "@/src/lib/feedback";
import {
  createTask,
  fetchFamilyMembers,
  fetchPlannerTasks,
  formatOverdueLabel,
  formatTaskDayHint,
  formatTaskDueLabel,
  getTaskSection,
  patchTask,
  resolveSchedulePreset,
  sortTasksByCompletion,
  sortTasksByDate,
  TASK_SCHEDULE_PRESET_LABELS,
  TASK_SCHEDULE_PRESETS,
  TASK_SECTIONS,
  todayLocalDate,
  FRIENDLY_ERROR,
  type FamilyMemberOption,
  type PlannerTask,
  type TaskSchedulePreset,
  type TaskSectionId,
} from "@/src/lib/tasks";
import {
  contentEntering,
  contentExiting,
  listItemEntering,
  listItemExiting,
  listLayout,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const UNDO_BANNER_MS = 6000;

/**
 * An undo write can itself fail (connectivity inside the banner window).
 * The local revert is then taken back so the list never claims a state
 * the database does not have — and the user hears about it.
 */
function notifyUndoFailed() {
  void fail();
  Alert.alert(
    "Rückgängig machen hat nicht geklappt",
    "Deine letzte Änderung bleibt bestehen. Ziehe zum Aktualisieren nach unten.",
  );
}

interface UndoState {
  /** Monotonic id so a new action restarts the banner's countdown. */
  id: number;
  message: string;
  revert: () => Promise<void>;
}

/**
 * Plan — the family planner ("Familienplaner"): what needs doing now,
 * what is coming up, what has no date yet, and what is done. Sections,
 * due labels and the seven-day Erledigt window are 1:1 the web's
 * task-utils contract, so both platforms group the same task the same
 * way. Every state change offers an undo (banner, one tap); the single
 * destructive action (Verwerfen) asks first.
 */
export default function PlanScreen() {
  const { family } = useFamily();
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayStr, setTodayStr] = useState(todayLocalDate());
  const [expanded, setExpanded] = useState<Partial<Record<TaskSectionId, boolean>>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [assignTask, setAssignTask] = useState<PlannerTask | null>(null);
  const [rescheduleTask, setRescheduleTask] = useState<PlannerTask | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoSeqRef = useRef(0);
  const assignSheetRef = useRef<OrdiloSheetHandle>(null);
  const rescheduleSheetRef = useRef<OrdiloSheetHandle>(null);

  // The sheets are imperative (drag-to-dismiss lives in the sheet); the
  // state only carries WHICH task they serve. Dismissal clears it again.
  useEffect(() => {
    if (assignTask) assignSheetRef.current?.present();
  }, [assignTask]);
  useEffect(() => {
    if (rescheduleTask) rescheduleSheetRef.current?.present();
  }, [rescheduleTask]);

  const memberById = useMemo(() => {
    const map = new Map<string, FamilyMemberOption>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

  const showUndo = useCallback((message: string, revert: () => Promise<void>) => {
    undoSeqRef.current += 1;
    setUndo({ id: undoSeqRef.current, message, revert });
  }, []);

  // The banner gives one calm moment to take an action back, then steps
  // aside on its own.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_BANNER_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const load = useCallback(
    async ({ refresh = false, silent = false } = {}) => {
      if (!family) {
        setTasks([]);
        setEvents([]);
        setMembers([]);
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else if (!silent) setLoading(true);
      setError(null);
      try {
        const [taskRows, eventRows, memberRows] = await Promise.all([
          fetchPlannerTasks(family.id),
          fetchPlannerEvents(family.id),
          fetchFamilyMembers(family.id),
        ]);
        setTasks(taskRows);
        setEvents(eventRows);
        setMembers(memberRows);
        setTodayStr(todayLocalDate());
      } catch {
        setError(FRIENDLY_ERROR);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [family],
  );

  // Refetch silently whenever the tab gains focus; the full loading
  // state only appears before the very first successful load.
  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load]),
  );

  /** Dismissed rows stay in the query result (shared OR filter) but never in the list — same rule as the web. */
  const visibleTasks = useMemo(
    () => tasks.filter((task) => task.status !== "dismissed"),
    [tasks],
  );
  const visibleEvents = useMemo(
    () => upcomingPlannerEvents(events, todayStr),
    [events, todayStr],
  );

  const grouped = useMemo(() => {
    const bySection: Record<TaskSectionId, PlannerTask[]> = {
      now: [],
      next: [],
      undated: [],
      done: [],
    };
    for (const task of visibleTasks) {
      bySection[getTaskSection(task, todayStr)].push(task);
    }
    bySection.now = sortTasksByDate(bySection.now);
    bySection.next = sortTasksByDate(bySection.next);
    bySection.done = sortTasksByCompletion(bySection.done);
    return bySection;
  }, [todayStr, visibleTasks]);

  const replaceTask = useCallback((updated: PlannerTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const toggleDone = useCallback(
    async (task: PlannerTask) => {
      const markingDone = task.status !== "done";
      const previous = { status: task.status, completed_at: task.completed_at };
      // Optimistic: the row moves now; the database trigger stamps the
      // authoritative completed_at behind it.
      const appliedTask: PlannerTask = {
        ...task,
        status: markingDone ? "done" : "open",
        completed_at: markingDone ? new Date().toISOString() : null,
      };
      replaceTask(appliedTask);
      const ok = await patchTask(task.id, {
        status: markingDone ? "done" : "open",
      });
      if (!ok) {
        replaceTask({ ...task, ...previous });
        void fail();
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      if (markingDone) {
        void success();
        showUndo("Erledigt", async () => {
          replaceTask({ ...task, ...previous });
          const undoOk = await patchTask(task.id, {
            status: previous.status,
            completed_at: previous.completed_at,
          });
          if (!undoOk) {
            replaceTask(appliedTask);
            notifyUndoFailed();
          }
        });
      }
    },
    [replaceTask, showUndo],
  );

  const assign = useCallback(
    async (task: PlannerTask, memberId: string | null) => {
      setAssignTask(null);
      const previousAssignee = task.assigned_to;
      if (previousAssignee === memberId) return;
      const assignedTask: PlannerTask = { ...task, assigned_to: memberId };
      replaceTask(assignedTask);
      const ok = await patchTask(task.id, { assigned_to: memberId });
      if (!ok) {
        replaceTask({ ...task, assigned_to: previousAssignee });
        void fail();
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      tap();
      const name = memberId ? (memberById.get(memberId)?.name ?? "jemandem") : null;
      showUndo(name ? `Jetzt bei ${name}` : "Niemandem zugeordnet", async () => {
        replaceTask({ ...task, assigned_to: previousAssignee });
        const undoOk = await patchTask(task.id, { assigned_to: previousAssignee });
        if (!undoOk) {
          replaceTask(assignedTask);
          notifyUndoFailed();
        }
      });
    },
    [memberById, replaceTask, showUndo],
  );

  /**
   * The "Wann?" answer: one tap on a preset resolves to a concrete due
   * date (every preset says which day it means), applied optimistically
   * with the same undo contract as completing.
   */
  const reschedule = useCallback(
    async (task: PlannerTask, preset: TaskSchedulePreset) => {
      const newDue = resolveSchedulePreset(preset, todayStr);
      if (newDue === task.due_date) return;
      const previousDue = task.due_date;
      const rescheduledTask: PlannerTask = { ...task, due_date: newDue };
      replaceTask(rescheduledTask);
      const ok = await patchTask(task.id, { due_date: newDue });
      if (!ok) {
        replaceTask(task);
        void fail();
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      void success();
      showUndo(`Verschoben: ${TASK_SCHEDULE_PRESET_LABELS[preset]}`, async () => {
        replaceTask(task);
        const undoOk = await patchTask(task.id, { due_date: previousDue });
        if (!undoOk) {
          replaceTask(rescheduledTask);
          notifyUndoFailed();
        }
      });
    },
    [replaceTask, showUndo, todayStr],
  );

  const dismiss = useCallback(
    async (task: PlannerTask) => {
      setFormOpen(false);
      setEditingTask(null);
      const dismissedTask: PlannerTask = { ...task, status: "dismissed" };
      replaceTask(dismissedTask);
      const ok = await patchTask(task.id, { status: "dismissed" });
      if (!ok) {
        replaceTask(task);
        void fail();
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      showUndo("Verworfen", async () => {
        replaceTask(task);
        // Restore the exact prior state — a dismissed task can come from
        // the Erledigt section, so hard-coding "open" would resurrect a
        // finished task as unfinished (and the trigger would clear its
        // completed_at).
        const undoOk = await patchTask(task.id, {
          status: task.status,
          due_date: task.due_date,
          completed_at: task.completed_at,
        });
        if (!undoOk) {
          replaceTask(dismissedTask);
          notifyUndoFailed();
        }
      });
    },
    [replaceTask, showUndo],
  );

  const submitForm = useCallback(
    async (values: TaskFormValues) => {
      if (!family) return { success: false, error: FRIENDLY_ERROR };
      if (editingTask) {
        const updates = {
          title: values.title,
          description: values.description || null,
          due_date: values.dueDate || null,
          assigned_to: values.assignedTo || null,
        };
        const previous = editingTask;
        replaceTask({ ...editingTask, ...updates });
        const ok = await patchTask(editingTask.id, updates);
        if (!ok) {
          replaceTask(previous);
          return { success: false, error: "Speichern hat nicht geklappt." };
        }
        void success();
        return { success: true };
      }
      const result = await createTask(family.id, values);
      if (!result.success) return { success: false, error: result.error };
      setTasks((prev) => [result.task, ...prev]);
      void success();
      return { success: true };
    },
    [editingTask, family, replaceTask],
  );

  const openCreate = useCallback(() => {
    setEditingTask(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((task: PlannerTask) => {
    setEditingTask(task);
    setFormOpen(true);
  }, []);

  if (loading && tasks.length === 0) {
    return (
      <Screen>
        <PlanHeader onCreate={openCreate} />
        <ListSkeleton rows={4} />
      </Screen>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <Screen>
        <PlanHeader onCreate={openCreate} />
        <View style={styles.centerFill}>
          <EmptyState
            description={error}
            heading="Plan nicht erreichbar"
            icon={AlertCircle}
          >
            <OrdiloButton onPress={() => void load()} size="lg" title="Erneut versuchen" />
          </EmptyState>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PlanHeader onCreate={openCreate} />
      {visibleTasks.length === 0 && visibleEvents.length === 0 ? (
        <EmptyState
          description="Lege die erste Aufgabe an — Fristen aus deinen Dokumenten erscheinen hier ebenfalls."
          heading="Noch nichts geplant"
          icon={CalendarDays}
        >
          <OrdiloButton onPress={openCreate} size="lg" title="Neue Aufgabe" />
        </EmptyState>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[colors.harborBlue]}
              onRefresh={() => void load({ refresh: true })}
              refreshing={refreshing}
              tintColor={colors.harborBlue}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {visibleEvents.length > 0 ? (
            <View style={styles.section}>
              <View accessibilityRole="header" style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Termine</Text>
                <Text style={styles.sectionCount}>{visibleEvents.length}</Text>
              </View>
              <View style={styles.sectionBody}>
                {visibleEvents.map((event) => (
                  <PlannerEventRow
                    event={event}
                    key={event.id}
                    members={members}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {TASK_SECTIONS.map((section) => {
            const sectionTasks = grouped[section.id];
            if (sectionTasks.length === 0) return null;
            const isExpanded = expanded[section.id] ?? false;
            const collapsed = Boolean(section.collapsible) && !isExpanded;
            const shown = collapsed
              ? sectionTasks.slice(0, section.peek ?? 0)
              : sectionTasks;
            const hiddenCount = sectionTasks.length - shown.length;
            return (
              <View key={section.id} style={styles.section}>
                <Pressable
                  accessibilityHint={
                    section.collapsible
                      ? isExpanded
                        ? "Bereich einklappen"
                        : "Bereich aufklappen"
                      : undefined
                  }
                  accessibilityRole={section.collapsible ? "button" : "header"}
                  disabled={!section.collapsible}
                  onPress={() =>
                    setExpanded((prev) => ({ ...prev, [section.id]: !isExpanded }))
                  }
                  style={styles.sectionHeader}
                >
                  <Text style={styles.sectionTitle}>{section.label}</Text>
                  <Text style={styles.sectionCount}>{sectionTasks.length}</Text>
                  {section.collapsible ? (
                    isExpanded ? (
                      <ChevronUp color={colors.mistDark} size={18} />
                    ) : (
                      <ChevronDown color={colors.mistDark} size={18} />
                    )
                  ) : null}
                </Pressable>
                <View style={styles.sectionBody}>
                  {shown.map((task, index) => (
                    <SwipeableTaskRow
                      index={index}
                      key={task.id}
                      member={task.assigned_to ? memberById.get(task.assigned_to) : undefined}
                      onAssign={() => setAssignTask(task)}
                      onPress={() => openEdit(task)}
                      onReschedule={() => setRescheduleTask(task)}
                      onToggle={() => void toggleDone(task)}
                      task={task}
                      todayStr={todayStr}
                    />
                  ))}
                </View>
                {hiddenCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setExpanded((prev) => ({ ...prev, [section.id]: true }))
                    }
                    style={styles.moreButton}
                  >
                    <Text style={styles.moreLabel}>+ {hiddenCount} weitere</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          <View style={styles.listBottomSpacer} />
        </ScrollView>
      )}

      <TaskFormSheet
        initialTask={editingTask}
        members={members}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onDismiss={editingTask ? () => void dismiss(editingTask) : undefined}
        onSubmit={submitForm}
        visible={formOpen}
      />

      <AssignSheet
        members={members}
        onDismiss={() => setAssignTask(null)}
        onSelect={(memberId) => {
          const task = assignTask;
          assignSheetRef.current?.dismiss();
          if (task) void assign(task, memberId);
        }}
        ref={assignSheetRef}
        task={assignTask}
      />

      <RescheduleSheet
        onDismiss={() => setRescheduleTask(null)}
        onSelect={(preset) => {
          const task = rescheduleTask;
          rescheduleSheetRef.current?.dismiss();
          if (task) void reschedule(task, preset);
        }}
        ref={rescheduleSheetRef}
        task={rescheduleTask}
        todayStr={todayStr}
      />

      {undo ? (
        <Animated.View
          entering={contentEntering()}
          exiting={contentExiting()}
          style={styles.undoBanner}
        >
          <Text numberOfLines={1} style={styles.undoMessage}>
            {undo.message}
          </Text>
          <Pressable
            accessibilityLabel="Rückgängig machen"
            accessibilityRole="button"
            onPress={() => {
              const action = undo;
              setUndo(null);
              void action.revert();
            }}
            style={styles.undoButton}
          >
            <Undo2 color={colors.warmApricotLight} size={16} strokeWidth={2.2} />
            <Text style={styles.undoButtonLabel}>Rückgängig</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

/** Screen header: title, calm subtitle, and the one primary action. */
function PlanHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <ScreenHeader
      action={{
        accessibilityLabel: "Neue Aufgabe anlegen",
        icon: Plus,
        onPress: onCreate,
      }}
      subtitle="Aufgaben und Termine der Familie"
      title="Plan"
    />
  );
}

function PlannerEventRow({
  event,
  members,
}: {
  event: PlannerEvent;
  members: FamilyMemberOption[];
}) {
  const date = new Date(`${event.starts_on}T12:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? event.starts_on
    : date.toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
  const people = formatEventPeople(event, members);

  return (
    <View style={styles.eventRow}>
      <View style={styles.eventIcon}>
        <CalendarDays color={colors.harborBlue} size={18} strokeWidth={2} />
      </View>
      <View style={styles.taskBody}>
        <Text numberOfLines={2} style={styles.taskTitle}>
          {event.title}
        </Text>
        <Text style={styles.taskDue}>
          {dateLabel} · {formatEventWhen(event)}
        </Text>
        {people ? (
          <Text numberOfLines={1} style={styles.taskNote}>
            {people}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A task row with the two named gestures from the web's planner
 * contract: swipe right completes (Harbor Blue panel, "Erledigt" —
 * "Wieder offen" on a finished row), swipe left opens the "Wann?"
 * sheet (Apricot panel). Both are reversible via the undo banner, and
 * both have tappable counterparts on the row itself (checkbox, edit
 * form) — a gesture is an accelerator, never the only way. Panels
 * appear from the first dragged pixel so the gesture teaches itself.
 */
function SwipeableTaskRow({
  index,
  member,
  onAssign,
  onPress,
  onReschedule,
  onToggle,
  task,
  todayStr,
}: {
  index: number;
  member: FamilyMemberOption | undefined;
  onAssign: () => void;
  onPress: () => void;
  onReschedule: () => void;
  onToggle: () => void;
  task: PlannerTask;
  todayStr: string;
}) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const done = task.status === "done";

  const commitFromGesture = useCallback(
    (direction: "left" | "right") => {
      swipeableRef.current?.close();
      if (direction === "right") onToggle();
      else onReschedule();
    },
    [onReschedule, onToggle],
  );

  return (
    <Animated.View
      entering={listItemEntering(index)}
      exiting={listItemExiting()}
      layout={listLayout()}
    >
      <ReanimatedSwipeable
        friction={2}
        leftThreshold={40}
        onSwipeableOpen={(direction) => commitFromGesture(direction)}
        onSwipeableWillOpen={() => select()}
        overshootLeft={false}
        overshootRight={false}
        ref={swipeableRef}
        renderLeftActions={() => (
          <Pressable
            accessibilityLabel={done ? "Aufgabe wieder öffnen" : "Aufgabe erledigen"}
            accessibilityRole="button"
            onPress={() => commitFromGesture("right")}
            style={[styles.swipePanel, styles.swipePanelLeading]}
          >
            {done ? (
              <Undo2 color={colors.warmWhite} size={18} strokeWidth={2.2} />
            ) : (
              <Check color={colors.warmWhite} size={18} strokeWidth={2.4} />
            )}
            <Text style={styles.swipePanelLabel}>
              {done ? "Wieder offen" : "Erledigt"}
            </Text>
          </Pressable>
        )}
        renderRightActions={
          // Honest Panel Rule: no "Wann?" promise on a finished task.
          done
            ? undefined
            : () => (
                <Pressable
                  accessibilityLabel="Aufgabe terminieren"
                  accessibilityRole="button"
                  onPress={() => commitFromGesture("left")}
                  style={[styles.swipePanel, styles.swipePanelTrailing]}
                >
                  <CalendarDays color={colors.warmWhite} size={18} strokeWidth={2.2} />
                  <Text style={styles.swipePanelLabel}>Wann?</Text>
                </Pressable>
              )
        }
        rightThreshold={40}
      >
        <TaskRow
          member={member}
          onAssign={onAssign}
          onPress={onPress}
          onToggle={onToggle}
          task={task}
          todayStr={todayStr}
        />
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

/**
 * One task row: checkbox (44px target), title + note + due meta, and the
 * assignee face — the four things a task carries, all on the row. Done
 * tasks drop the note and mute the text; lateness shows in apricot on
 * the row that is late, never as a red section.
 */
function TaskRow({
  member,
  onAssign,
  onPress,
  onToggle,
  task,
  todayStr,
}: {
  member: FamilyMemberOption | undefined;
  onAssign: () => void;
  onPress: () => void;
  onToggle: () => void;
  task: PlannerTask;
  todayStr: string;
}) {
  const done = task.status === "done";
  const overdue = done ? null : formatOverdueLabel(task.due_date, todayStr);
  const dueLabel = overdue ?? formatTaskDueLabel(task.due_date, todayStr);

  return (
    <View style={styles.taskRow}>
      <Pressable
        accessibilityLabel={done ? `${task.title} wieder öffnen` : `${task.title} erledigen`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        hitSlop={10}
        onPress={onToggle}
        style={[styles.checkbox, done && styles.checkboxDone]}
      >
        {done ? <Check color={colors.warmWhite} size={16} strokeWidth={3} /> : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`${task.title} bearbeiten`}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.taskBody}
      >
        <Text
          numberOfLines={2}
          style={[styles.taskTitle, done && styles.taskTitleDone]}
        >
          {task.title}
        </Text>
        {!done && task.description ? (
          <Text numberOfLines={1} style={styles.taskNote}>
            {task.description}
          </Text>
        ) : null}
        {dueLabel ? (
          <Text style={[styles.taskDue, overdue ? styles.taskDueOverdue : null]}>
            {dueLabel}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={
          member ? `${task.title} ist bei ${member.name} — neu zuordnen` : `${task.title} zuordnen`
        }
        accessibilityRole="button"
        hitSlop={8}
        onPress={onAssign}
        style={[
          styles.assigneeDot,
          member
            ? { backgroundColor: member.avatar_color ?? colors.sandLight }
            : styles.assigneeDotEmpty,
        ]}
      >
        {member ? (
          <Text style={styles.assigneeInitial}>
            {member.name.trim().charAt(0).toUpperCase() || "?"}
          </Text>
        ) : (
          <Plus color={colors.mistDark} size={14} strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );
}

/**
 * The "Wer macht das?" picker: one decision, committed on tap — choosing
 * is the way out, so there is no close button (a drag or backdrop tap
 * still dismisses without a change).
 */
const AssignSheet = forwardRef<
  OrdiloSheetHandle,
  {
    members: FamilyMemberOption[];
    onDismiss: () => void;
    onSelect: (memberId: string | null) => void;
    task: PlannerTask | null;
  }
>(function AssignSheet({ members, onDismiss, onSelect, task }, ref) {
  return (
    <OrdiloSheet
      accessibilityLabel="Wer macht das?"
      onDismiss={onDismiss}
      ref={ref}
    >
      <Text style={styles.pickerTitle}>Wer macht das?</Text>
      {members.map((member) => {
        const selected = task?.assigned_to === member.id;
        return (
          <Pressable
            accessibilityLabel={`Aufgabe an ${member.name} geben`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={member.id}
            onPress={() => onSelect(member.id)}
            style={[styles.pickerRow, selected && styles.pickerRowSelected]}
          >
            <View
              style={[
                styles.assigneeDot,
                styles.pickerDot,
                { backgroundColor: member.avatar_color ?? colors.sandLight },
              ]}
            >
              <Text style={styles.assigneeInitial}>
                {member.name.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
            <Text style={styles.pickerLabel}>{member.name}</Text>
            {selected ? (
              <Check color={colors.harborBlue} size={18} strokeWidth={2.4} />
            ) : null}
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel="Niemandem zuordnen"
        accessibilityRole="button"
        accessibilityState={{ selected: task?.assigned_to == null }}
        onPress={() => onSelect(null)}
        style={[
          styles.pickerRow,
          task?.assigned_to == null && styles.pickerRowSelected,
        ]}
      >
        <View style={[styles.assigneeDot, styles.pickerDot, styles.assigneeDotEmpty]}>
          <Plus color={colors.mistDark} size={14} strokeWidth={2.2} />
        </View>
        <Text style={styles.pickerLabel}>Niemandem</Text>
        {task?.assigned_to == null ? (
          <Check color={colors.harborBlue} size={18} strokeWidth={2.4} />
        ) : null}
      </Pressable>
    </OrdiloSheet>
  );
});

/**
 * The "Wann?" sheet: the one-tap answers to rescheduling. Every preset
 * spells out the day it lands on ("Morgen · Sa, 23.08."), so nobody
 * guesses — and choosing is the way out, no close button.
 */
const RescheduleSheet = forwardRef<
  OrdiloSheetHandle,
  {
    onDismiss: () => void;
    onSelect: (preset: TaskSchedulePreset) => void;
    task: PlannerTask | null;
    todayStr: string;
  }
>(function RescheduleSheet({ onDismiss, onSelect, task, todayStr }, ref) {
  if (!task) {
    // Keep the sheet mounted (imperative present/dismiss) but empty
    // when it serves no task.
    return <OrdiloSheet onDismiss={onDismiss} ref={ref} />;
  }
  return (
    <OrdiloSheet
      accessibilityLabel="Wann ist das dran?"
      onDismiss={onDismiss}
      ref={ref}
    >
      <Text style={styles.pickerTitle}>Wann ist das dran?</Text>
      {TASK_SCHEDULE_PRESETS.map((preset) => {
        const due = resolveSchedulePreset(preset, todayStr);
        const selected = task.due_date === due;
        const dayHint = formatTaskDayHint(due);
        return (
          <Pressable
            accessibilityLabel={`${TASK_SCHEDULE_PRESET_LABELS[preset]}${dayHint ? `, ${dayHint}` : ""}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={preset}
            onPress={() => onSelect(preset)}
            style={[styles.pickerRow, selected && styles.pickerRowSelected]}
          >
            <Text style={styles.pickerLabel}>
              {TASK_SCHEDULE_PRESET_LABELS[preset]}
            </Text>
            {dayHint ? <Text style={styles.pickerHint}>{dayHint}</Text> : null}
            {selected ? (
              <Check color={colors.harborBlue} size={18} strokeWidth={2.4} />
            ) : null}
          </Pressable>
        );
      })}
    </OrdiloSheet>
  );
});

const styles = StyleSheet.create({
  centerFill: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  sectionTitle: {
    color: colors.harborBlue,
    ...typography.headline,
  },
  sectionCount: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  moreButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  moreLabel: {
    color: colors.harborBlue,
    ...typography.title,
  },
  listBottomSpacer: {
    height: spacing["2xl"],
  },
  taskRow: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  eventRow: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.mistDark,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  checkboxDone: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  taskBody: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    color: colors.graphite,
    ...typography.title,
  },
  taskTitleDone: {
    color: colors.mistDark,
    textDecorationLine: "line-through",
  },
  taskNote: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  taskDue: {
    color: colors.mistDark,
    ...typography.label,
  },
  taskDueOverdue: {
    color: colors.warmApricot,
  },
  assigneeDot: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  assigneeDotEmpty: {
    borderColor: colors.mist,
    borderStyle: "dashed",
    borderWidth: 1,
  },
  assigneeInitial: {
    color: colors.warmWhite,
    ...typography.title,
  },
  swipePanel: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginBottom: 0,
    paddingHorizontal: spacing.md,
  },
  swipePanelLeading: {
    backgroundColor: colors.harborBlue,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  swipePanelTrailing: {
    backgroundColor: colors.warmApricot,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  swipePanelLabel: {
    color: colors.warmWhite,
    ...typography.label,
  },
  pickerHint: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  pickerTitle: {
    color: colors.graphite,
    marginBottom: spacing.sm,
    ...typography.display,
  },
  pickerRow: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  pickerRowSelected: {
    backgroundColor: "rgba(48, 84, 96, 0.08)",
    borderColor: colors.harborBlue,
  },
  pickerDot: {
    height: 36,
    width: 36,
  },
  pickerLabel: {
    color: colors.graphite,
    flex: 1,
    ...typography.title,
  },
  undoBanner: {
    alignItems: "center",
    backgroundColor: colors.harborBlueDarker,
    borderRadius: radii.md,
    bottom: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    left: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    position: "absolute",
    right: spacing.md,
  },
  undoMessage: {
    color: colors.warmWhite,
    flex: 1,
    ...typography.body,
  },
  undoButton: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  undoButtonLabel: {
    color: colors.warmApricotLight,
    ...typography.title,
  },
});
