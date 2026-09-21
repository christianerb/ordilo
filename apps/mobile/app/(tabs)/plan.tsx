import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "@/src/lib/session";
import { loadTaskHandoffs, acceptTaskHandoff, taskHandoffLabel, type TaskAcceptance } from "@/src/lib/task-handoffs";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Inbox,
  List,
  Plus,
  Undo2,
  UserRound,
  X,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useReducedMotion,
  type AnimatedStyle,
  type BaseAnimationBuilder,
} from "react-native-reanimated";

import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { CreateChoiceSheet } from "@/src/components/create-choice-sheet";
import { EventFormSheet } from "@/src/components/event-form-sheet";
import {
  PlanDetailSheet,
  type PlanDetailAction,
} from "@/src/components/plan-detail-sheet";
import { AvatarStack, EmptyPersonSeat, PersonAvatar, PersonChip } from "@/src/components/person";
import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { TaskCheck } from "@/src/components/task-check";
import { MOBILE_DOCK_CONTENT_INSET } from "@/src/components/ordilo-tab-bar";
import { OrdiloPickerSheet } from "@/src/components/picker-sheet";
import type { OrdiloSheetHandle } from "@/src/components/sheet";
import { TaskFormSheet, type TaskFormValues } from "@/src/components/task-form-sheet";
import {
  Chip,
  EmptyState,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
  SegmentedControl,
} from "@/src/components/ui";
import { memberToPerson } from "@/src/lib/people";
import {
  calendarDays,
  createPlannerEvent,
  deletePlannerEvent,
  fetchPlannerEvents,
  formatEventWhen,
  formatGermanDate,
  monthStart,
  restorePlannerEventOccurrence,
  shiftMonth,
  skipPlannerEventOccurrence,
  toCalendarDate,
  upcomingPlannerEvents,
  updatePlannerEvent,
  type PlannerEventInput,
  type PlannerEvent,
} from "@/src/lib/calendar";
import {
  formatPlanDayMark,
  formatPlanEntryPeople,
  formatPlanEntryWhen,
  groupPlanEntries,
  isPlanEntryOverdue,
  planDayMark,
  planEntriesForDay,
  planEntryCounts,
  planEntryForEvent,
  planEntryKey,
  planEntryMemberIds,
  planSnapshotRows,
  type PlanEntry,
} from "@/src/lib/plan-entries";
import { cachePlanSnapshot } from "@/src/lib/plan-offline";
import { useFamily } from "@/src/lib/family-context";
import { fail, select, success } from "@/src/lib/feedback";
import {
  createTask,
  fetchFamilyMembers,
  fetchPlannerTasks,
  formatPlanHeaderSubtitle,
  formatTaskDayHint,
  parseQuickTaskTitle,
  patchTask,
  resolveKnownMemberId,
  resolveSchedulePreset,
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
  cssEaseOut,
  durations,
  feedbackEntering,
  feedbackExiting,
  listLayout,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const UNDO_BANNER_MS = 6000;

const AnimatedText = Animated.createAnimatedComponent(Text);

/**
 * A row that was just created arrives; a row that just left by
 * completion or rescheduling departs. Both reuse the feedback-banner
 * vocabulary — 8px and a fade — gated to the one affected id so an
 * ordinary tab visit never staggers the whole list.
 *
 * The done state on a title eases its color over to mist: the
 * strikethrough itself cannot animate, so the color carries the state
 * change as a settle instead of a snap. Color interpolates on the UI
 * runtime and stays on under Reduce Motion — it is a state cue, not
 * movement.
 */
const taskTitleColorTransition: AnimatedStyle<TextStyle> = {
  color: colors.graphite,
  transitionDuration: durations.fast,
  transitionProperty: "color",
  transitionTimingFunction: cssEaseOut,
};
const taskTitleColorTransitionDone: AnimatedStyle<TextStyle> = {
  color: colors.mistDark,
};

/**
 * The two lenses on one plan: "Liste" groups by urgency, "Kalender"
 * groups by day. Both show the same entries — Aufgaben und Termine —
 * so neither view can hide a whole class of thing from the other.
 */
type PlanViewId = "list" | "calendar";

/** Deep links keep working: ?tab=tasks is the old name for the list. */
function parsePlanTab(value: string | undefined): PlanViewId | null {
  if (value === "calendar") return "calendar";
  if (value === "list" || value === "tasks") return "list";
  return null;
}

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
  const router = useRouter();
  const { create, tab, task, event, person } = useLocalSearchParams<{
    tab?: string;
    /** Deep link: open this task's detail sheet (used by chat actions). */
    task?: string;
    /** Deep link: open this appointment's detail sheet. */
    event?: string;
    /**
     * Person context ("Aufgabe für Karina" aus dem Familienprofil):
     * preselected in the quick entry and in newly opened create forms.
     * An unknown id is ignored silently.
     */
    person?: string;
    /** Deep link: open the create form directly — "task" or "event". */
    create?: string;
  }>();
  const reduceMotion = useReducedMotion();
  const { family } = useFamily();
  const { session } = useSession();
  const [accepted, setAccepted] = useState<TaskAcceptance[]>([]);
  const [ownMemberIds, setOwnMemberIds] = useState<string[]>([]);
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayStr, setTodayStr] = useState(todayLocalDate());
  const [expanded, setExpanded] = useState<Partial<Record<TaskSectionId, boolean>>>({});
  const [sectionOpen, setSectionOpen] = useState<
    Partial<Record<TaskSectionId, boolean>>
  >({ undated: true });
  const [formOpen, setFormOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [rescheduleTask, setRescheduleTask] = useState<PlannerTask | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [view, setView] = useState<PlanViewId>("list");
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<PlanEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PlannerEvent | null>(null);
  const [eventDelete, setEventDelete] = useState<
    { event: PlannerEvent; date: string; scope: "single" | "series" } | null
  >(null);
  const [eventDeleting, setEventDeleting] = useState(false);
  const [eventDeleteError, setEventDeleteError] = useState<string | null>(null);
  /** Runs once the detail sheet has finished closing (see PlanDetailAction). */
  const pendingDetailRef = useRef<(() => void) | null>(null);
  /** A deep link ("?event=…") waiting for its row to arrive from the server. */
  const focusRef = useRef<{ kind: "task" | "event"; id: string } | null>(null);
  /** The "?person=…" context, preselected in quick entry and create forms. */
  const [personContext, setPersonContext] = useState<string | null>(null);
  /** A "?create=task|event" request, opened once the first load settled. */
  const [createRequest, setCreateRequest] = useState<"task" | "event" | null>(null);
  /**
   * Distinguishes the focus re-run caused by our own setParams cleanup
   * from a genuinely parameterless visit. Only the latter ends the
   * person context — it belongs to the deep link that carried it in and
   * must never leak into unrelated quick entries of a later visit.
   */
  const paramsConsumedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    const requested = parsePlanTab(tab);
    const focusTask = typeof task === "string" ? task : null;
    const focusEvent = typeof event === "string" ? event : null;
    const contextPerson = typeof person === "string" && person ? person : null;
    const createKind = create === "task" || create === "event" ? create : null;
    if (!requested && !focusTask && !focusEvent && !contextPerson && !createKind) {
      if (paramsConsumedRef.current) {
        paramsConsumedRef.current = false;
        return;
      }
      setPersonContext(null);
      return;
    }
    paramsConsumedRef.current = true;
    setView(requested ?? (focusEvent ? "calendar" : "list"));
    setPersonFilter(null);
    if (focusTask) focusRef.current = { kind: "task", id: focusTask };
    if (focusEvent) focusRef.current = { kind: "event", id: focusEvent };
    // A fresh deep link replaces the context wholesale — including
    // clearing it when the new link names no person.
    setPersonContext(contextPerson);
    if (createKind) setCreateRequest(createKind);
    router.setParams({ tab: undefined, task: undefined, event: undefined, person: undefined, create: undefined });
  }, [create, event, person, router, tab, task]));
  const [assignTask, setAssignTask] = useState<PlannerTask | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  /** The task the quick entry just made — the row the Wann?/Wer? bar points at. */
  const [quickTaskId, setQuickTaskId] = useState<string | null>(null);
  /** The row that should animate its arrival — set at creation, never on load. */
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  /** The task that should fade out — set when it leaves its section. */
  const [justDepartedId, setJustDepartedId] = useState<string | null>(null);
  /** The last open task was completed by hand — the quiet all-done moment. */
  const [allDoneCheered, setAllDoneCheered] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeMonth, setActiveMonth] = useState(() => monthStart(new Date()));
  const undoSeqRef = useRef(0);
  const createSheetRef = useRef<OrdiloSheetHandle>(null);
  const pendingCreateRef = useRef<"task" | "event" | null>(null);

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
        const loadedToday = todayLocalDate();
        setTodayStr(loadedToday);
        // Keep the offline snapshot in step with what the plan shows.
        // Fire-and-forget: rendering never waits on the cache.
        try {
          const snapshotSections = groupPlanEntries(taskRows, eventRows, loadedToday);
          void cachePlanSnapshot(
            family.id,
            planSnapshotRows(
              [
                ...snapshotSections.now,
                ...snapshotSections.next,
                ...snapshotSections.undated,
                ...snapshotSections.done,
              ],
              memberRows,
              loadedToday,
            ),
          );
        } catch {
          // The snapshot is a convenience — it never blocks the plan.
        }
        if (session?.user.id) {
          const handoffs = await loadTaskHandoffs(family.id, session.user.id);
          setAccepted(handoffs.accepted);
          setOwnMemberIds(handoffs.ownMemberIds);
        }
      } catch {
        setError(FRIENDLY_ERROR);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [family, session],
  );

  // Refetch silently whenever the tab gains focus; the full loading
  // state only appears before the very first successful load.
  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void load({ silent: true }); });
    return () => subscription.remove();
  }, [load]);

  const acceptHandoff = useCallback(async (task: PlannerTask) => {
    if (acceptBusy) return;
    setAcceptBusy(task.id);
    try {
      await acceptTaskHandoff(task.id);
      await load({ silent: true });
      void success();
    } catch (caught) { setError(caught instanceof Error ? caught.message : FRIENDLY_ERROR); void fail(); }
    finally { setAcceptBusy(null); }
  }, [acceptBusy, load]);

  /** Dismissed rows stay in the query result (shared OR filter) but never in the list — same rule as the web. */
  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status !== "dismissed" &&
          (personFilter === null || task.assigned_to === personFilter),
      ),
    [personFilter, tasks],
  );
  /** Open means: visible and not done. The all-done moment hangs off this. */
  const openTaskCount = useMemo(
    () => visibleTasks.filter((task) => task.status !== "done").length,
    [visibleTasks],
  );
  const personEvents = useMemo(
    () =>
      personFilter === null
        ? events
        : events.filter(
            (event) =>
              event.responsible_member_id === personFilter ||
              event.attendee_ids.includes(personFilter),
          ),
    [events, personFilter],
  );
  const filterPerson = useMemo(
    () => members.find((member) => member.id === personFilter) ?? null,
    [members, personFilter],
  );

  /**
   * The "?person=…" context, resolved against the loaded members.
   * Unknown ids silently fall back to "no person", never to a wrong one.
   */
  const personContextMember = useMemo(
    () => resolveKnownMemberId(members, personContext),
    [members, personContext],
  );

  /**
   * The quick entry ("Neue Aufgabe …"): one line, Enter, done. The new
   * task shows up immediately and is replaced by the server row when the
   * write lands; a failure puts the title back into the input.
   */
  const submitQuickEntry = useCallback(async () => {
    if (!family || quickBusy) return;
    const title = parseQuickTaskTitle(quickTitle);
    if (!title) return;
    const assignee = personContextMember;
    const tempId = `quick-${Date.now()}`;
    const optimistic: PlannerTask = {
      id: tempId,
      family_id: family.id,
      document_id: null,
      title,
      description: null,
      due_date: null,
      status: "open",
      confidence: 1,
      confirmed: true,
      created_at: new Date().toISOString(),
      tags: [],
      assigned_to: assignee,
      completed_at: null,
    };
    setTasks((prev) => [optimistic, ...prev]);
    // The fresh row animates its arrival; the server twin replacing it
    // keeps the same spot and does not replay the entrance.
    setJustCreatedId(tempId);
    setAllDoneCheered(false);
    setQuickTitle("");
    setQuickBusy(true);
    try {
      const result = await createTask(family.id, {
        title,
        assignedTo: assignee ?? "",
      });
      if (!result.success) throw new Error(result.error);
      setTasks((prev) => prev.map((item) => (item.id === tempId ? result.task : item)));
      setQuickTaskId(result.task.id);
      void success();
    } catch {
      setTasks((prev) => prev.filter((item) => item.id !== tempId));
      setQuickTitle(title);
      void fail();
      Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
    } finally {
      setQuickBusy(false);
    }
  }, [family, personContextMember, quickBusy, quickTitle]);

  /** The fresh quick-entry task the Wann?/Wer? bar belongs to. */
  const quickTask = useMemo(() => {
    if (!quickTaskId) return null;
    const found = tasks.find((item) => item.id === quickTaskId);
    return found && found.status === "open" ? found : null;
  }, [quickTaskId, tasks]);

  /**
   * A "?create=task|event" deep link opens the matching form once the
   * first load has settled, so the person context prefill resolves
   * against real members instead of being guessed. Render-time
   * adjustment (same pattern as the sheets' reopen reset): only this
   * screen's own state is set, and React re-renders immediately.
   */
  if (createRequest && !loading) {
    setCreateRequest(null);
    if (createRequest === "task") {
      setEditingTask(null);
      setFormOpen(true);
    } else {
      setEventFormOpen(true);
    }
  }

  /** Tasks and appointments in one grouped list — the Liste view. */
  const grouped = useMemo(
    () => groupPlanEntries(visibleTasks, personEvents, todayStr),
    [personEvents, todayStr, visibleTasks],
  );
  /** The selected day in the Kalender view: its appointments and its tasks. */
  const dayEntries = useMemo(
    () => planEntriesForDay(visibleTasks, personEvents, selectedDate),
    [personEvents, selectedDate, visibleTasks],
  );
  const entryCount = useMemo(
    () =>
      TASK_SECTIONS.reduce(
        (total, section) => total + grouped[section.id].length,
        0,
      ),
    [grouped],
  );

  // The all-done moment hides itself: it only renders while
  // openTaskCount is 0, and the create paths clear the flag when new
  // work arrives. Only a completion by hand sets it (see toggleDone),
  // never a load that happens to find nothing.
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
        // The row leaves its section — let it fade instead of teleporting,
        // and when that was the last open task, say so once.
        setJustDepartedId(task.id);
        if (personFilter === null && openTaskCount === 1) {
          setAllDoneCheered(true);
        }
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
    [openTaskCount, personFilter, replaceTask, showUndo],
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
      // A new due date can move the row into another section — same
      // fade-out bridge as completing.
      setJustDepartedId(task.id);
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

  /**
   * "Wer macht das?" from the row: one tap on a face reassigns, with the
   * same optimistic write and undo as every other change here.
   */
  const assign = useCallback(
    async (task: PlannerTask, memberId: string | null) => {
      setAssignTask(null);
      if (memberId === task.assigned_to) return;
      const previous = task.assigned_to;
      const assignedTask: PlannerTask = { ...task, assigned_to: memberId };
      replaceTask(assignedTask);
      const ok = await patchTask(task.id, { assigned_to: memberId });
      if (!ok) {
        replaceTask(task);
        void fail();
        Alert.alert("Das hat nicht geklappt", "Bitte versuche es erneut.");
        return;
      }
      void success();
      const name = members.find((member) => member.id === memberId)?.name;
      showUndo(name ? `${name} kümmert sich` : "Niemand zugeteilt", async () => {
        replaceTask(task);
        const undoOk = await patchTask(task.id, { assigned_to: previous });
        if (!undoOk) {
          replaceTask(assignedTask);
          notifyUndoFailed();
        }
      });
    },
    [members, replaceTask, showUndo],
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
      setJustCreatedId(result.task.id);
      setAllDoneCheered(false);
      void success();
      return { success: true };
    },
    [editingTask, family, replaceTask],
  );

  const openTaskCreate = useCallback(() => {
    setEditingTask(null);
    setFormOpen(true);
  }, []);

  const openCreateMenu = useCallback(() => {
    createSheetRef.current?.present();
  }, []);

  const chooseCreateType = useCallback((type: "task" | "event") => {
    pendingCreateRef.current = type;
    createSheetRef.current?.dismiss();
  }, []);

  const finishCreateChoice = useCallback(() => {
    const type = pendingCreateRef.current;
    pendingCreateRef.current = null;
    if (type === "task") openTaskCreate();
    if (type === "event") setEventFormOpen(true);
  }, [openTaskCreate]);

  /**
   * One submit path for both directions: an appointment being changed
   * goes through the transactional update RPC, a new one through create.
   */
  const submitEvent = useCallback(
    async (values: PlannerEventInput) => {
      if (!family) {
        return {
          success: false,
          error: "Deine Familie konnte nicht geladen werden.",
        };
      }
      const target = new Date(`${values.date}T12:00:00`);
      if (editingEvent) {
        const result = await updatePlannerEvent(editingEvent.id, values);
        if (!result.success) return result;
        const saved = result.event;
        setEvents((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
        setSelectedDate(target);
        setActiveMonth(monthStart(target));
        void success();
        return { success: true };
      }
      const result = await createPlannerEvent(family.id, values);
      if (!result.success) return result;
      setEvents((current) => [...current, result.event]);
      setJustCreatedId(result.event.id);
      setSelectedDate(target);
      setActiveMonth(monthStart(target));
      setView("calendar");
      void success();
      return { success: true };
    },
    [editingEvent, family],
  );

  const openEdit = useCallback((task: PlannerTask) => {
    setEditingTask(task);
    setFormOpen(true);
  }, []);

  // ---------------------------------------------------------------------
  // Detail sheet — the one place a task or an appointment opens into
  // ---------------------------------------------------------------------

  const openDetail = useCallback((entry: PlanEntry) => {
    select();
    setDetailEntry(entry);
    setDetailOpen(true);
  }, []);

  /**
   * Every follow-up (a form, a picker, a confirmation) is its own modal
   * layer, and two of those on screen at once fight on iOS. So the detail
   * sheet closes first and the queued step runs once it is gone.
   */
  const runAfterDetail = useCallback((step: () => void) => {
    pendingDetailRef.current = step;
    setDetailOpen(false);
  }, []);

  const finishDetail = useCallback(() => {
    const step = pendingDetailRef.current;
    pendingDetailRef.current = null;
    setDetailEntry(null);
    step?.();
  }, []);

  const deleteEvent = useCallback(async () => {
    if (!eventDelete) return;
    setEventDeleting(true);
    setEventDeleteError(null);
    const { event: target, date, scope } = eventDelete;
    try {
      if (scope === "single") {
        const result = await skipPlannerEventOccurrence(target, date);
        if (!result.success) {
          setEventDeleteError(result.error);
          return;
        }
        const saved = result.event;
        setEvents((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
        void success();
        setEventDelete(null);
        showUndo("Tag aus der Serie gestrichen", async () => {
          const undone = await restorePlannerEventOccurrence(target, date);
          if (!undone.success) {
            notifyUndoFailed();
            return;
          }
          setEvents((current) =>
            current.map((item) =>
              item.id === undone.event.id ? undone.event : item,
            ),
          );
        });
        return;
      }
      const result = await deletePlannerEvent(target.id);
      if (!result.success) {
        setEventDeleteError(result.error);
        return;
      }
      setEvents((current) => current.filter((item) => item.id !== target.id));
      void success();
      setEventDelete(null);
    } catch {
      setEventDeleteError(FRIENDLY_ERROR);
    } finally {
      setEventDeleting(false);
    }
  }, [eventDelete, showUndo]);

  const handleDetailAction = useCallback(
    (action: PlanDetailAction) => {
      const entry = detailEntry;
      if (!entry) return;
      switch (action.type) {
        case "toggle-done":
          if (entry.kind !== "task") return;
          runAfterDetail(() => void toggleDone(entry.task));
          return;
        case "reschedule":
          if (entry.kind !== "task") return;
          runAfterDetail(() => setRescheduleTask(entry.task));
          return;
        case "assign":
          if (entry.kind !== "task") return;
          runAfterDetail(() => setAssignTask(entry.task));
          return;
        case "dismiss":
          if (entry.kind !== "task") return;
          runAfterDetail(() => void dismiss(entry.task));
          return;
        case "edit":
          runAfterDetail(() => {
            if (entry.kind === "task") {
              openEdit(entry.task);
              return;
            }
            setEditingEvent(entry.event);
            setEventFormOpen(true);
          });
          return;
        case "skip-occurrence":
          if (entry.kind !== "event") return;
          runAfterDetail(() => {
            setEventDeleteError(null);
            setEventDelete({
              event: entry.event,
              date: entry.date,
              scope: "single",
            });
          });
          return;
        case "delete":
          if (entry.kind !== "event") return;
          runAfterDetail(() => {
            setEventDeleteError(null);
            setEventDelete({
              event: entry.event,
              date: entry.date,
              scope: "series",
            });
          });
          return;
        case "open-document":
          runAfterDetail(() =>
            router.push(`/document/${action.documentId}`),
          );
          return;
      }
    },
    [detailEntry, dismiss, openEdit, router, runAfterDetail, toggleDone],
  );

  /**
   * A deep link ("Termin öffnen" from a chat action) can land before the
   * row it points at has loaded. The request waits here until its entry
   * shows up, then opens the same detail sheet a tap would.
   */
  useEffect(() => {
    const request = focusRef.current;
    if (!request) return;
    if (request.kind === "task") {
      const match = tasks.find((item) => item.id === request.id);
      if (!match) return;
      focusRef.current = null;
      openDetail({
        kind: "task",
        id: match.id,
        date: match.due_date,
        task: match,
      });
      return;
    }
    const match = events.find((item) => item.id === request.id);
    if (!match) return;
    focusRef.current = null;
    // A series lands on its next occurrence, a one-off on its own day.
    const day =
      upcomingPlannerEvents([match], todayStr)[0]?.starts_on ?? match.starts_on;
    const occursOn = new Date(`${day}T12:00:00`);
    setSelectedDate(occursOn);
    setActiveMonth(monthStart(occursOn));
    openDetail(planEntryForEvent(match, day));
  }, [events, openDetail, tasks, todayStr]);

  const headerSubtitle =
    loading && tasks.length === 0
      ? "Wird geladen …"
      : formatPlanHeaderSubtitle({
          ...planEntryCounts(grouped),
          filterName: filterPerson?.name ?? null,
        });

  const personFilterRow =
    members.length > 1 ? (
      <ScrollView
        contentContainerStyle={styles.personChips}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.personChipRow}
      >
        <Chip
          label="Alle"
          onPress={() => setPersonFilter(null)}
          selected={personFilter === null}
        />
        {members.map((member) => (
          <Pressable
            accessibilityLabel={`Nur ${member.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: personFilter === member.id }}
            key={member.id}
            onPress={() => {
              select();
              setPersonFilter((current) => (current === member.id ? null : member.id));
            }}
          >
            <PersonChip person={memberToPerson(member)} selected={personFilter === member.id} />
          </Pressable>
        ))}
      </ScrollView>
    ) : null;

  if (loading && tasks.length === 0) {
    return (
      <Screen>
        <PlanHeader onCreate={openCreateMenu} subtitle={headerSubtitle} />
        <View style={styles.loadingList}>
          <ListSkeleton rows={4} />
        </View>
      </Screen>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <Screen>
        <PlanHeader onCreate={openCreateMenu} subtitle={headerSubtitle} />
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

  // The two one-row motions: a freshly created entry arrives, a
  // completed or rescheduled task departs. Both stay gated to the one id
  // they belong to — an ordinary visit never replays them.
  const arrivalMotion = feedbackEntering(reduceMotion);
  const departureMotion = feedbackExiting();

  const tabItems = [
    {
      icon: List,
      label: "Liste",
      onPress: () => {
        if (view === "list") return;
        select();
        setView("list");
      },
      selected: view === "list",
    },
    {
      icon: CalendarDays,
      label: "Kalender",
      onPress: () => {
        if (view === "calendar") return;
        select();
        setView("calendar");
      },
      selected: view === "calendar",
    },
  ] as const;

  return (
    <Screen>
      {view === "calendar" ? (
        <CalendarView
          activeMonth={activeMonth}
          createdEntryId={justCreatedId}
          entries={dayEntries}
          entryArrival={arrivalMotion}
          events={personEvents}
          header={
            <>
              <PlanHeader onCreate={openCreateMenu} subtitle={headerSubtitle} />
              <SegmentedControl items={tabItems} />
              {personFilterRow}
            </>
          }
          members={members}
          onAssign={setAssignTask}
          onChangeMonth={setActiveMonth}
          onCreate={family ? openCreateMenu : undefined}
          onOpenEntry={openDetail}
          onSelectDate={setSelectedDate}
          onToggleTask={(item) => void toggleDone(item)}
          selectedDate={selectedDate}
          tasks={visibleTasks}
          todayStr={todayStr}
        />
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
          <PlanHeader onCreate={openCreateMenu} subtitle={headerSubtitle} />
          <SegmentedControl items={tabItems} style={styles.viewTabs} />
          {personFilterRow}
          <QuickTaskEntry
            busy={quickBusy}
            onChange={setQuickTitle}
            onSubmit={() => void submitQuickEntry()}
            value={quickTitle}
          />
          {quickTask ? (
            <View style={styles.quickContext}>
              <Text numberOfLines={1} style={styles.quickContextTitle}>
                {quickTask.title}
              </Text>
              <Pressable
                accessibilityHint="Öffnet die Auswahl für das Datum"
                accessibilityLabel="Wann ist das dran?"
                accessibilityRole="button"
                onPress={() => setRescheduleTask(quickTask)}
                style={({ pressed }) => [
                  styles.quickContextButton,
                  pressed && styles.quickContextButtonPressed,
                ]}
              >
                <CalendarDays color={colors.harborBlue} size={16} strokeWidth={2} />
                <Text style={styles.quickContextAction}>Wann?</Text>
              </Pressable>
              <Pressable
                accessibilityHint="Öffnet die Auswahl für die verantwortliche Person"
                accessibilityLabel="Wer macht das?"
                accessibilityRole="button"
                onPress={() => setAssignTask(quickTask)}
                style={({ pressed }) => [
                  styles.quickContextButton,
                  pressed && styles.quickContextButtonPressed,
                ]}
              >
                <UserRound color={colors.harborBlue} size={16} strokeWidth={2} />
                <Text style={styles.quickContextAction}>Wer?</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Schnelleintrag-Hinweis schließen"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setQuickTaskId(null)}
                style={styles.quickContextClose}
              >
                <X color={colors.mistDark} size={16} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}
          {entryCount === 0 ? (
            filterPerson ? (
              <EmptyState
                description={`Für ${filterPerson.name} ist gerade nichts offen. Neue Aufgaben kannst du direkt zuteilen.`}
                heading="Alles erledigt"
                icon={Check}
              >
                <OrdiloButton onPress={() => setPersonFilter(null)} size="lg" title="Alle anzeigen" variant="outline" />
              </EmptyState>
            ) : (
              <EmptyState
                description="Leg die erste Aufgabe oder den ersten Termin an. Fristen aus euren Dokumenten landen hier von selbst."
                heading="Noch nichts geplant"
                icon={CalendarDays}
              >
                <OrdiloButton onPress={openCreateMenu} size="lg" title="Etwas anlegen" />
              </EmptyState>
            )
          ) : null}
          {allDoneCheered && openTaskCount === 0 && personFilter === null ? (
            <Animated.View
              accessibilityLiveRegion="polite"
              entering={contentEntering()}
              style={styles.allDone}
            >
              <OrdiloCharacter animated size={88} />
              <Text style={styles.allDoneTitle}>Alles erledigt</Text>
              <Text style={styles.allDoneText}>
                Es ist nichts mehr offen. Lehnt euch zurück.
              </Text>
            </Animated.View>
          ) : null}
          {TASK_SECTIONS.map((section) => {
            const sectionEntries = grouped[section.id];
            if (sectionEntries.length === 0) return null;
            const isExpanded = expanded[section.id] ?? false;
            const isOpen = section.collapsible
              ? (sectionOpen[section.id] ?? false)
              : true;
            const shown = !isOpen
              ? []
              : section.id === "done" || isExpanded
                ? sectionEntries
                : sectionEntries.slice(0, section.peek ?? sectionEntries.length);
            const hiddenCount = sectionEntries.length - shown.length;
            const SectionIcon =
              section.id === "now"
                ? Clock3
                : section.id === "next"
                  ? ArrowRight
                  : section.id === "undated"
                    ? Inbox
                    : Check;
            return (
              <View
                key={section.id}
                style={[
                  styles.taskSection,
                  section.id === "done" && styles.taskSectionDone,
                ]}
              >
                <Pressable
                  accessibilityHint={
                    section.collapsible
                      ? isOpen
                        ? "Bereich einklappen"
                        : "Bereich aufklappen"
                      : undefined
                  }
                  accessibilityRole={section.collapsible ? "button" : "header"}
                  disabled={!section.collapsible}
                  onPress={() =>
                    setSectionOpen((prev) => ({
                      ...prev,
                      [section.id]: !isOpen,
                    }))
                  }
                  style={styles.taskSectionHeader}
                >
                  <View
                    style={[
                      styles.taskSectionIcon,
                      section.id === "done" && styles.taskSectionIconDone,
                    ]}
                  >
                    <SectionIcon
                      color={colors.harborBlue}
                      size={19}
                      strokeWidth={2}
                    />
                  </View>
                  <Text style={styles.sectionTitle}>{section.label}</Text>
                  <Text style={styles.sectionCount}>{sectionEntries.length}</Text>
                  <View style={styles.sectionHeaderSpacer} />
                  {section.collapsible ? (
                    isOpen ? (
                      <ChevronUp color={colors.mistDark} size={18} />
                    ) : (
                      <ChevronDown color={colors.mistDark} size={18} />
                    )
                  ) : null}
                </Pressable>
                {shown.length > 0 ? (
                  <View style={styles.taskSectionBody}>
                    {shown.map((entry) => (
                      <PlanRow
                        acceptBusy={acceptBusy}
                        accepted={accepted}
                        entry={entry}
                        entryMotion={
                          entry.id === justCreatedId ? arrivalMotion : undefined
                        }
                        exitMotion={
                          entry.kind === "task" && entry.id === justDepartedId
                            ? departureMotion
                            : undefined
                        }
                        key={planEntryKey(entry)}
                        members={members}
                        onAcceptHandoff={
                          entry.kind === "task"
                            ? () => void acceptHandoff(entry.task)
                            : undefined
                        }
                        onAssign={setAssignTask}
                        onOpen={openDetail}
                        onReschedule={setRescheduleTask}
                        onToggle={(item) => void toggleDone(item)}
                        ownMemberIds={ownMemberIds}
                        todayStr={todayStr}
                      />
                    ))}
                  </View>
                ) : null}
                {isOpen && hiddenCount > 0 && section.id !== "done" ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setExpanded((prev) => ({ ...prev, [section.id]: true }))
                    }
                    style={styles.moreButton}
                  >
                    <List
                      color={colors.harborBlue}
                      size={19}
                      strokeWidth={1.9}
                    />
                    <Text style={styles.moreLabel}>
                      Alle {sectionEntries.length} anzeigen
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          <View style={styles.listBottomSpacer} />
        </ScrollView>
      )}

      <TaskFormSheet
        initialPerson={personContextMember}
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

      <EventFormSheet
        defaultDate={toCalendarDate(
          view === "calendar" ? selectedDate : new Date(),
        )}
        event={editingEvent}
        initialPerson={personContextMember}
        key={editingEvent ? `event-${editingEvent.id}` : "event-new"}
        members={members}
        onClose={() => {
          setEventFormOpen(false);
          setEditingEvent(null);
        }}
        onSubmit={submitEvent}
        visible={eventFormOpen}
      />

      <PlanDetailSheet
        entry={detailEntry}
        members={members}
        onAction={handleDetailAction}
        onClose={() => setDetailOpen(false)}
        onDismissed={finishDetail}
        todayStr={todayStr}
        visible={detailOpen}
      />

      <ConfirmDialog
        confirmLabel={
          eventDelete?.scope === "single" ? "Tag streichen" : "Löschen"
        }
        error={eventDeleteError}
        loading={eventDeleting}
        loadingLabel="Wird entfernt …"
        message={
          eventDelete
            ? eventDelete.scope === "single"
              ? `„${eventDelete.event.title}“ fällt am ${formatGermanDate(eventDelete.date)} aus. Alle anderen Termine der Serie bleiben.`
              : `„${eventDelete.event.title}“ wird für die ganze Familie entfernt.${eventDelete.event.recurrence !== "none" ? " Das gilt für alle Termine der Serie." : ""}`
            : ""
        }
        onCancel={() => {
          setEventDelete(null);
          setEventDeleteError(null);
        }}
        onConfirm={() => void deleteEvent()}
        title={
          eventDelete?.scope === "single"
            ? "Diesen Tag streichen?"
            : "Termin löschen?"
        }
        visible={eventDelete !== null}
      />

      <CreateChoiceSheet
        accessibilityLabel="Im Plan anlegen"
        items={[
          {
            accessibilityLabel: "Neue Aufgabe",
            description: "Etwas, das jemand erledigen soll",
            icon: Check,
            label: "Aufgabe",
            onPress: () => chooseCreateType("task"),
            tint: "sage",
          },
          {
            accessibilityLabel: "Neuer Termin",
            description: "Ein Zeitpunkt im Familienkalender",
            icon: CalendarDays,
            label: "Termin",
            onPress: () => chooseCreateType("event"),
            tint: "apricot",
          },
        ]}
        onDismiss={finishCreateChoice}
        ref={createSheetRef}
      />

      <OrdiloPickerSheet
        accessibilityLabel="Wann ist das dran?"
        onClose={() => setRescheduleTask(null)}
        options={TASK_SCHEDULE_PRESETS.map((preset) => {
          const due = resolveSchedulePreset(preset, todayStr);
          const hint = formatTaskDayHint(due);
          return {
            accessibilityLabel: `${TASK_SCHEDULE_PRESET_LABELS[preset]}${hint ? `, ${hint}` : ""}`,
            hint: hint ?? undefined,
            key: preset,
            label: TASK_SCHEDULE_PRESET_LABELS[preset],
            onPress: () => {
              if (rescheduleTask) void reschedule(rescheduleTask, preset);
            },
            selected: rescheduleTask?.due_date === due,
          };
        })}
        title="Wann ist das dran?"
        visible={rescheduleTask !== null}
      />

      <OrdiloPickerSheet
        accessibilityLabel="Wer macht das?"
        onClose={() => setAssignTask(null)}
        options={[
          ...members.map((member) => ({
            key: member.id,
            label: member.name,
            leading: <PersonAvatar person={memberToPerson(member)} size={36} />,
            onPress: () => {
              if (assignTask) void assign(assignTask, member.id);
            },
            selected: assignTask?.assigned_to === member.id,
          })),
          {
            key: "unassigned",
            label: "Niemand",
            leading: <EmptyPersonSeat size={36} />,
            onPress: () => {
              if (assignTask) void assign(assignTask, null);
            },
            selected: assignTask?.assigned_to === null,
          },
        ]}
        title="Wer macht das?"
        visible={assignTask !== null}
      />

      {undo ? (
        <Animated.View
          entering={feedbackEntering(reduceMotion)}
          exiting={feedbackExiting()}
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
function PlanHeader({ onCreate, subtitle }: { onCreate: () => void; subtitle: string }) {
  return (
    <ScreenHeader
      action={{
        accessibilityLabel: "Aufgabe oder Termin anlegen",
        icon: Plus,
        onPress: onCreate,
      }}
      subtitle={subtitle}
      title="Plan"
    />
  );
}

/**
 * The one-line quick entry above the sections (TickTick pattern): type
 * a title, press Enter, and the task exists — unscheduled, with the
 * current person context if there is one. The full form stays behind
 * the "+" path; this line is for the thought that cannot wait.
 */
function QuickTaskEntry({
  busy,
  onChange,
  onSubmit,
  value,
}: {
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  return (
    <View style={styles.quickEntry}>
      <Plus color={colors.mistDark} size={18} strokeWidth={2} />
      <TextInput
        accessibilityLabel="Neue Aufgabe schnell anlegen"
        autoCapitalize="sentences"
        blurOnSubmit={false}
        editable={!busy}
        maxLength={200}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Neue Aufgabe …"
        placeholderTextColor={colors.mistDark}
        returnKeyType="done"
        style={styles.quickEntryInput}
        value={value}
      />
      {busy ? (
        <ActivityIndicator color={colors.harborBlue} size="small" />
      ) : null}
    </View>
  );
}

/**
 * Month calendar with day selection.
 *
 * The grid marks what a day carries — apricot for appointments, harbor
 * blue for tasks — and the list below shows both for the selected day.
 * That symmetry is the point: the Liste view groups the same entries by
 * urgency, so neither view hides a kind of thing the other one shows.
 */
function CalendarView({
  activeMonth,
  createdEntryId,
  entries,
  entryArrival,
  events,
  header,
  members,
  onAssign,
  onChangeMonth,
  onCreate,
  onOpenEntry,
  onSelectDate,
  onToggleTask,
  selectedDate,
  tasks,
  todayStr,
}: {
  activeMonth: Date;
  /** A freshly created entry animates its arrival in the day list. */
  createdEntryId?: string | null;
  /** The selected day's appointments and tasks, already in order. */
  entries: PlanEntry[];
  entryArrival?: BaseAnimationBuilder;
  events: PlannerEvent[];
  /** Screen header and view tabs, scrolled away with the content. */
  header?: ReactNode;
  members: FamilyMemberOption[];
  onAssign: (task: PlannerTask) => void;
  onChangeMonth: (date: Date) => void;
  onCreate?: () => void;
  onOpenEntry: (entry: PlanEntry) => void;
  onSelectDate: (date: Date) => void;
  onToggleTask: (task: PlannerTask) => void;
  selectedDate: Date;
  tasks: PlannerTask[];
  todayStr: string;
}) {
  const days = useMemo(() => calendarDays(activeMonth), [activeMonth]);
  const monthTitle = activeMonth.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
  const selectedTitle = selectedDate.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const selectedIso = toCalendarDate(selectedDate);
  const showToday =
    selectedIso !== todayStr ||
    activeMonth.getMonth() !== new Date().getMonth() ||
    activeMonth.getFullYear() !== new Date().getFullYear();

  const goToToday = useCallback(() => {
    select();
    const now = new Date();
    onChangeMonth(monthStart(now));
    onSelectDate(now);
  }, [onChangeMonth, onSelectDate]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.calendarContent}
    >
      {header}
      <View style={styles.calendarSurface}>
        <View style={styles.monthHeader}>
          <Pressable
            accessibilityLabel="Vorheriger Monat"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              const previous = shiftMonth(activeMonth, -1);
              onChangeMonth(previous);
              onSelectDate(previous);
            }}
            style={styles.monthButton}
          >
            <ChevronLeft color={colors.harborBlue} size={20} />
          </Pressable>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <Pressable
            accessibilityLabel="Nächster Monat"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              const next = shiftMonth(activeMonth, 1);
              onChangeMonth(next);
              onSelectDate(next);
            }}
            style={styles.monthButton}
          >
            <ChevronRight color={colors.harborBlue} size={20} />
          </Pressable>
        </View>
        <View style={styles.weekdayRow}>
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
            <Text key={day} style={styles.weekdayLabel}>{day}</Text>
          ))}
        </View>
        <View style={styles.monthGrid}>
          {days.map((day) => {
            const inMonth = day.getMonth() === activeMonth.getMonth();
            const iso = toCalendarDate(day);
            const selected = iso === selectedIso;
            const isToday = iso === todayStr;
            const mark = planDayMark(tasks, events, day);
            const marked = formatPlanDayMark(mark);
            return (
              <Pressable
                accessibilityLabel={`${day.getDate()}. ${monthTitle}${marked ? `, ${marked}` : ""}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={iso}
                onPress={() => {
                  select();
                  onSelectDate(day);
                }}
                style={[
                  styles.dayButton,
                  !inMonth && styles.dayButtonOutside,
                  selected && styles.dayButtonSelected,
                ]}
              >
                <Text style={[styles.dayLabel, !inMonth && styles.dayLabelOutside, selected && styles.dayLabelSelected]}>
                  {day.getDate()}
                </Text>
                {isToday && !selected ? (
                  <View style={styles.dayTodayRing} />
                ) : null}
                <View style={styles.dayMarks}>
                  {mark.events > 0 ? (
                    <View
                      style={[styles.eventDot, selected && styles.dotOnSelected]}
                    />
                  ) : null}
                  {mark.tasks > 0 ? (
                    <View
                      style={[styles.taskDot, selected && styles.dotOnSelected]}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.calendarLegend}>
          <View style={styles.legendItem}>
            <View style={styles.eventDot} />
            <Text style={styles.legendLabel}>Termin</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.taskDot} />
            <Text style={styles.legendLabel}>Aufgabe</Text>
          </View>
          {showToday ? (
            <Pressable
              accessibilityLabel="Zu heute springen"
              accessibilityRole="button"
              hitSlop={6}
              onPress={goToToday}
              style={({ pressed }) => [
                styles.todayButton,
                pressed && styles.todayButtonPressed,
              ]}
            >
              <Text style={styles.todayButtonLabel}>Heute</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.dayEventsHeader}>
        <Text style={styles.dayEventsTitle}>
          {selectedIso === todayStr ? `Heute · ${selectedTitle}` : selectedTitle}
        </Text>
        <Text style={styles.dayEventsCount}>{entries.length}</Text>
      </View>
      {entries.length === 0 ? (
        <View style={styles.calendarEmptyCard}>
          <Text style={styles.calendarEmptyTitle}>Dieser Tag ist noch frei.</Text>
          <Text style={styles.calendarEmpty}>
            Trag einen Termin ein oder plan eine Aufgabe, wenn ihr soweit seid.
          </Text>
          {onCreate ? (
            <OrdiloButton
              icon={<Plus color={colors.graphite} size={17} strokeWidth={2} />}
              onPress={onCreate}
              title="Etwas anlegen"
              variant="outline"
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.eventList}>
          {entries.map((entry) => (
            <PlanRow
              entry={entry}
              entryMotion={
                entry.id === createdEntryId ? entryArrival : undefined
              }
              key={planEntryKey(entry)}
              members={members}
              onAssign={onAssign}
              onOpen={onOpenEntry}
              onToggle={onToggleTask}
              showDay={false}
              todayStr={todayStr}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * One entry in the plan, whichever kind it is. A task keeps its two
 * named gestures; an appointment has nothing to swipe, so it is a plain
 * row — but both open the same detail sheet on tap, which is what makes
 * the two views feel like one product instead of two lists.
 */
function PlanRow({
  acceptBusy,
  accepted,
  entry,
  entryMotion,
  exitMotion,
  members,
  onAcceptHandoff,
  onAssign,
  onOpen,
  onReschedule,
  onToggle,
  ownMemberIds,
  showDay = true,
  todayStr,
}: {
  acceptBusy?: string | null;
  accepted?: TaskAcceptance[];
  entry: PlanEntry;
  /** Set on the one freshly created row — never on an ordinary visit. */
  entryMotion?: BaseAnimationBuilder;
  /** Set on the one row that is leaving its section right now. */
  exitMotion?: BaseAnimationBuilder;
  members: FamilyMemberOption[];
  onAcceptHandoff?: () => void;
  onAssign: (task: PlannerTask) => void;
  onOpen: (entry: PlanEntry) => void;
  onReschedule?: (task: PlannerTask) => void;
  onToggle: (task: PlannerTask) => void;
  ownMemberIds?: string[];
  showDay?: boolean;
  todayStr: string;
}) {
  if (entry.kind === "task") {
    return (
      <SwipeableTaskRow
        acceptBusy={acceptBusy}
        accepted={accepted}
        entryMotion={entryMotion}
        exitMotion={exitMotion}
        members={members}
        onAcceptHandoff={onAcceptHandoff}
        onAssign={() => onAssign(entry.task)}
        onPress={() => onOpen(entry)}
        onReschedule={() => onReschedule?.(entry.task)}
        onToggle={() => onToggle(entry.task)}
        ownMemberIds={ownMemberIds}
        rescheduleEnabled={Boolean(onReschedule)}
        showDay={showDay}
        task={entry.task}
        todayStr={todayStr}
      />
    );
  }

  return (
    <Animated.View entering={entryMotion} layout={listLayout()}>
      <EventRow
        entry={entry}
        members={members}
        onPress={() => onOpen(entry)}
        showDay={showDay}
        todayStr={todayStr}
      />
    </Animated.View>
  );
}

/**
 * One appointment row: the calendar tile says what kind of entry this
 * is (where a task shows its checkbox), then title, when, and who is
 * involved. The whole row opens the detail sheet.
 */
function EventRow({
  entry,
  members,
  onPress,
  showDay,
  todayStr,
}: {
  entry: Extract<PlanEntry, { kind: "event" }>;
  members: FamilyMemberOption[];
  onPress: () => void;
  showDay: boolean;
  todayStr: string;
}) {
  const when = showDay
    ? formatPlanEntryWhen(entry, todayStr)
    : formatEventWhen(entry.event);
  const people = formatPlanEntryPeople(entry, members);
  const memberIds = planEntryMemberIds(entry);
  const faces = members
    .filter((member) => memberIds.includes(member.id))
    .map(memberToPerson);

  return (
    <Pressable
      accessibilityHint="Öffnet den Termin"
      accessibilityLabel={`Termin ${entry.event.title}${when ? `, ${when}` : ""}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.planRow, pressed && styles.planRowPressed]}
    >
      <View style={styles.eventIcon}>
        <CalendarDays color={colors.harborBlue} size={18} strokeWidth={2} />
      </View>
      <View style={styles.taskBody}>
        <Text numberOfLines={2} style={styles.taskTitle}>
          {entry.event.title}
        </Text>
        {entry.event.location ? (
          <Text numberOfLines={1} style={styles.taskNote}>
            {entry.event.location}
          </Text>
        ) : null}
        {when ? <Text style={styles.taskDue}>{when}</Text> : null}
        {people ? (
          <Text numberOfLines={1} style={styles.taskNote}>
            {people}
          </Text>
        ) : null}
      </View>
      {faces.length > 0 ? <AvatarStack people={faces} size={26} /> : null}
    </Pressable>
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
  acceptBusy,
  accepted,
  entryMotion,
  exitMotion,
  members,
  onAcceptHandoff,
  onAssign,
  onPress,
  onReschedule,
  onToggle,
  ownMemberIds,
  rescheduleEnabled = true,
  showDay = true,
  task,
  todayStr,
}: {
  acceptBusy?: string | null;
  accepted?: TaskAcceptance[];
  entryMotion?: BaseAnimationBuilder;
  exitMotion?: BaseAnimationBuilder;
  members: FamilyMemberOption[];
  onAcceptHandoff?: () => void;
  onAssign: () => void;
  onPress: () => void;
  onReschedule: () => void;
  onToggle: () => void;
  ownMemberIds?: string[];
  /** Honest Panel Rule: no "Wann?" promise where nothing handles it. */
  rescheduleEnabled?: boolean;
  /** The calendar day list already names the day, so the row omits it. */
  showDay?: boolean;
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
      entering={entryMotion}
      exiting={exitMotion}
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
          done || !rescheduleEnabled
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
          acceptBusy={acceptBusy}
          accepted={accepted}
          members={members}
          onAcceptHandoff={onAcceptHandoff}
          onAssign={onAssign}
          onPress={onPress}
          onToggle={onToggle}
          ownMemberIds={ownMemberIds}
          showDay={showDay}
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
  acceptBusy,
  accepted,
  members,
  onAcceptHandoff,
  onAssign,
  onPress,
  onToggle,
  ownMemberIds,
  showDay = true,
  task,
  todayStr,
}: {
  acceptBusy?: string | null;
  accepted?: TaskAcceptance[];
  members: FamilyMemberOption[];
  onAcceptHandoff?: () => void;
  onAssign: () => void;
  onPress: () => void;
  onToggle: () => void;
  ownMemberIds?: string[];
  showDay?: boolean;
  task: PlannerTask;
  todayStr: string;
}) {
  const done = task.status === "done";
  const entry: PlanEntry = {
    kind: "task",
    id: task.id,
    date: task.due_date,
    task,
  };
  const overdue = isPlanEntryOverdue(entry, todayStr);
  const dueLabel = showDay ? formatPlanEntryWhen(entry, todayStr) : null;
  const assignee = members.find((member) => member.id === task.assigned_to) ?? null;

  // Assigned, but not yet accepted — the dashed ring below says so on
  // its own; a separate "Für X vorgesehen" line would just repeat it in
  // words. Undefined `accepted` (the calendar day list never loads it)
  // keeps every avatar solid, exactly as before this existed.
  const assignedTo = task.assigned_to;
  const acceptedBy = accepted?.find((a) => a.task_id === task.id)?.member_id;
  const pending =
    accepted !== undefined && !done && assignedTo !== null && assignedTo !== acceptedBy;
  const canAccept =
    pending &&
    assignedTo !== null &&
    Boolean(ownMemberIds?.includes(assignedTo)) &&
    Boolean(onAcceptHandoff);
  const handoffStatus = assignee
    ? taskHandoffLabel(assignedTo, acceptedBy, assignee.name)
    : null;

  return (
    <View style={styles.planRow}>
      <TaskCheck
        accessibilityLabel={done ? `${task.title} wieder öffnen` : `${task.title} erledigen`}
        done={done}
        onToggle={onToggle}
      />
      <Pressable
        accessibilityHint="Öffnet die Aufgabe"
        accessibilityLabel={`Aufgabe ${task.title}${dueLabel ? `, ${dueLabel}` : ""}`}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.taskBody}
      >
        <AnimatedText
          numberOfLines={2}
          style={[
            styles.taskTitle,
            done && styles.taskTitleDone,
            taskTitleColorTransition,
            done && taskTitleColorTransitionDone,
          ]}
        >
          {task.title}
        </AnimatedText>
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
        accessibilityHint={canAccept ? "Übernimmt die Aufgabe" : "Ändert, wer sich kümmert"}
        accessibilityLabel={
          assignee
            ? `${handoffStatus ?? `${assignee.name} zugewiesen`}${
                canAccept ? ", zum Übernehmen antippen" : ", ändern"
              }`
            : "Niemand zugeteilt, jemanden auswählen"
        }
        accessibilityRole="button"
        disabled={done || acceptBusy === task.id}
        hitSlop={6}
        onPress={canAccept ? onAcceptHandoff : onAssign}
        style={[styles.assignee, acceptBusy === task.id && styles.assigneeBusy]}
      >
        {assignee ? (
          <PersonAvatar person={memberToPerson(assignee)} pending={pending} size={30} />
        ) : done ? null : (
          <EmptyPersonSeat size={30} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingList: { paddingTop: spacing.md },
  // Only the spacing around the shared SegmentedControl is local.
  viewTabs: {
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  calendarContent: {
    gap: spacing.md,
    paddingBottom: MOBILE_DOCK_CONTENT_INSET,
  },
  calendarSurface: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  monthHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  monthButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  monthTitle: {
    color: colors.graphite,
    textTransform: "capitalize",
    ...typography.headline,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  weekdayLabel: {
    color: colors.mistDark,
    textAlign: "center",
    width: "14.2857%",
    ...typography.label,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    position: "relative",
    width: "14.2857%",
  },
  dayButtonOutside: {
    opacity: 0.45,
  },
  dayButtonSelected: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
  },
  dayLabel: {
    color: colors.graphite,
    ...typography.timestamp,
  },
  dayLabelOutside: {
    color: colors.mistDark,
  },
  dayLabelSelected: {
    color: colors.warmWhite,
    ...typography.title,
  },
  dayTodayRing: {
    borderColor: colors.harborBlue,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 34,
    position: "absolute",
    top: 4,
    width: 34,
  },
  dayMarks: {
    bottom: 5,
    flexDirection: "row",
    gap: 3,
    position: "absolute",
  },
  eventDot: {
    backgroundColor: colors.warmApricot,
    borderRadius: radii.pill,
    height: 5,
    width: 5,
  },
  taskDot: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 5,
    width: 5,
  },
  dotOnSelected: { backgroundColor: colors.warmWhite },
  calendarLegend: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  legendLabel: { color: colors.mistDark, ...typography.label },
  todayButton: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    marginLeft: "auto",
    minHeight: 32,
    paddingHorizontal: 12,
  },
  todayButtonPressed: { backgroundColor: colors.sandWarm },
  todayButtonLabel: { color: colors.harborBlue, ...typography.label },
  dayEventsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dayEventsTitle: {
    color: colors.harborBlue,
    flex: 1,
    textTransform: "capitalize",
    ...typography.headline,
  },
  dayEventsCount: {
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    color: colors.harborBlue,
    minWidth: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textAlign: "center",
    ...typography.timestamp,
  },
  calendarEmptyCard: {
    alignItems: "flex-start",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  calendarEmptyTitle: { color: colors.graphite, ...typography.title },
  calendarEmpty: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  eventList: {
    gap: spacing.sm,
  },
  section: {
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  taskSection: {
    backgroundColor: colors.washSageSoft,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  taskSectionDone: {
    backgroundColor: colors.sand,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  taskSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  taskSectionIcon: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  taskSectionIconDone: {
    backgroundColor: colors.washSage,
  },
  sectionTitle: {
    color: colors.harborBlue,
    ...typography.display,
  },
  sectionCount: {
    backgroundColor: colors.warmWhite,
    borderRadius: radii.pill,
    color: colors.harborBlue,
    minWidth: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textAlign: "center",
    ...typography.timestamp,
  },
  sectionHeaderSpacer: {
    flex: 1,
  },
  taskSectionBody: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  moreButton: {
    alignItems: "center",
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  moreLabel: {
    color: colors.harborBlue,
    ...typography.title,
  },
  listBottomSpacer: {
    height: MOBILE_DOCK_CONTENT_INSET,
  },
  /** One row shell for both kinds — the leading slot says which it is. */
  planRow: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 72,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  planRowPressed: { backgroundColor: colors.sandLight },
  eventIcon: {
    alignItems: "center",
    backgroundColor: colors.washBlue,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    marginHorizontal: 4,
    width: 36,
  },
  assignee: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  assigneeBusy: { opacity: 0.5 },
  personChipRow: { marginBottom: spacing.md, marginHorizontal: -spacing.md },
  personChips: { gap: spacing.xs, paddingHorizontal: spacing.md },
  quickEntry: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  quickEntryInput: {
    color: colors.graphite,
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  quickContext: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
    minHeight: 44,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  quickContextTitle: {
    color: colors.graphite,
    flex: 1,
    minWidth: 0,
    ...typography.timestamp,
  },
  quickContextButton: {
    alignItems: "center",
    borderRadius: radii.base,
    flexDirection: "row",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  quickContextButtonPressed: { backgroundColor: colors.sandWarm },
  quickContextAction: {
    color: colors.harborBlue,
    ...typography.label,
  },
  quickContextClose: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  taskBody: {
    flex: 1,
    gap: 2,
  },
  allDone: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  allDoneTitle: {
    color: colors.graphite,
    textAlign: "center",
    ...typography.display,
  },
  allDoneText: {
    color: colors.mistDark,
    textAlign: "center",
    ...typography.body,
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
  undoBanner: {
    alignItems: "center",
    backgroundColor: colors.harborBlueDarker,
    borderRadius: radii.md,
    // Sits above the floating dock, never behind it.
    bottom: MOBILE_DOCK_CONTENT_INSET,
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
