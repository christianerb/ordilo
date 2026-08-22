import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TaskFormSheet, type TaskFormValues } from "@/src/components/task-form-sheet";
import { EmptyState, OrdiloButton, Screen } from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import {
  createTask,
  fetchFamilyMembers,
  fetchPlannerTasks,
  formatOverdueLabel,
  formatTaskDueLabel,
  getTaskSection,
  patchTask,
  sortTasksByCompletion,
  sortTasksByDate,
  TASK_SECTIONS,
  todayLocalDate,
  FRIENDLY_ERROR,
  type FamilyMemberOption,
  type PlannerTask,
  type TaskSectionId,
} from "@/src/lib/tasks";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const UNDO_BANNER_MS = 6000;

/**
 * An undo write can itself fail (connectivity inside the banner window).
 * The local revert is then taken back so the list never claims a state
 * the database does not have — and the user hears about it.
 */
function notifyUndoFailed() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayStr, setTodayStr] = useState(todayLocalDate());
  const [expanded, setExpanded] = useState<Partial<Record<TaskSectionId, boolean>>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [assignTask, setAssignTask] = useState<PlannerTask | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoSeqRef = useRef(0);

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
        setMembers([]);
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else if (!silent) setLoading(true);
      setError(null);
      try {
        const [taskRows, memberRows] = await Promise.all([
          fetchPlannerTasks(family.id),
          fetchFamilyMembers(family.id),
        ]);
        setTasks(taskRows);
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      if (markingDone) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const dismiss = useCallback(
    async (task: PlannerTask) => {
      setFormOpen(false);
      setEditingTask(null);
      const dismissedTask: PlannerTask = { ...task, status: "dismissed" };
      replaceTask(dismissedTask);
      const ok = await patchTask(task.id, { status: "dismissed" });
      if (!ok) {
        replaceTask(task);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return { success: true };
      }
      const result = await createTask(family.id, values);
      if (!result.success) return { success: false, error: result.error };
      setTasks((prev) => [result.task, ...prev]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        <View style={styles.centerFill}>
          <ActivityIndicator
            accessibilityLabel="Aufgaben werden geladen"
            color={colors.harborBlue}
          />
        </View>
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
      {visibleTasks.length === 0 ? (
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
                  {shown.map((task) => (
                    <TaskRow
                      key={task.id}
                      member={task.assigned_to ? memberById.get(task.assigned_to) : undefined}
                      onAssign={() => setAssignTask(task)}
                      onPress={() => openEdit(task)}
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
        onClose={() => setAssignTask(null)}
        onSelect={(memberId) => {
          if (assignTask) void assign(assignTask, memberId);
          else setAssignTask(null);
        }}
        task={assignTask}
      />

      {undo ? (
        <View style={styles.undoBanner}>
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
            <Text style={styles.undoButtonLabel}>Rückgängig</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

/** Screen header: title, calm subtitle, and the one primary action. */
function PlanHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={[typography.display, styles.headerTitle]}>Plan</Text>
        <Text style={[typography.timestamp, styles.headerSubtitle]}>
          Aufgaben und Termine der Familie
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Neue Aufgabe anlegen"
        accessibilityRole="button"
        onPress={onCreate}
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
      >
        <Plus color={colors.warmWhite} size={22} strokeWidth={2.2} />
      </Pressable>
    </View>
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
 * is the way out, so there is no close button (backdrop tap still
 * dismisses without a change).
 */
function AssignSheet({
  members,
  onClose,
  onSelect,
  task,
}: {
  members: FamilyMemberOption[];
  onClose: () => void;
  onSelect: (memberId: string | null) => void;
  task: PlannerTask | null;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent
      visible={task !== null}
    >
      <Pressable onPress={onClose} style={styles.overlay}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.pickerSheet}
        >
          <View style={styles.handle} />
          <Text style={styles.pickerTitle}>Wer macht das?</Text>
          {/* Bounded + scrollable: a large family's member rows must stay
              reachable instead of spilling past the sheet's edge. */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.pickerList}
          >
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
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerFill: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.graphite,
  },
  headerSubtitle: {
    color: colors.mistDark,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  addButtonPressed: {
    opacity: 0.85,
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
  overlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "70%",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  pickerList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    width: 40,
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
    borderRadius: radii.sm,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  undoButtonLabel: {
    color: colors.warmApricotLight,
    ...typography.title,
  },
});
