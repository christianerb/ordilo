import { useCallback, useState } from "react";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Heart,
  Trash2,
  UserRound,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ConfirmDialog } from "./confirm-dialog";
import { OrdiloPickerOverlay } from "./picker-sheet";
import {
  OrdiloNestedSheet,
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormInput,
  OrdiloFormSelect,
  OrdiloFormSheet,
  OrdiloSheetHeader,
} from "./sheet";
import { OrdiloButton } from "./ui";
import {
  formatTaskDayHint,
  todayLocalDate,
  validateTaskInput,
  type FamilyMemberOption,
  type PlannerTask,
} from "@/src/lib/tasks";
import { toCalendarDate } from "@/src/lib/calendar";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export interface TaskFormValues {
  title: string;
  description: string;
  dueDate: string;
  assignedTo: string;
}

export type TaskFormSubmit = (
  values: TaskFormValues,
) => Promise<{ success: boolean; error?: string }>;

/**
 * Bottom-sheet form for creating or editing a task. Creating and editing
 * are the same job (like the web's create/detail sheets), so one sheet
 * carries title, note, the "Wann?" presets — each saying out loud which
 * day it means — and the "Wer?" member chips. In edit mode it also holds
 * the one destructive action, "Verwerfen", behind a confirmation.
 */
export function TaskFormSheet({
  initialTask,
  members,
  onClose,
  onDismiss,
  onSubmit,
  visible,
}: {
  /** Set for edit mode; undefined means "Neue Aufgabe". */
  initialTask?: PlannerTask | null;
  members: FamilyMemberOption[];
  onClose: () => void;
  /** Edit mode only: dismiss the task (parent confirms + handles undo). */
  onDismiss?: () => void;
  onSubmit: TaskFormSubmit;
  visible: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayStr, setTodayStr] = useState(todayLocalDate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);

  // Re-seed the draft every time the sheet opens so a stale edit never
  // leaks into the next task. Render-time adjustment instead of an
  // effect — the official pattern for derived resets.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setTitle(initialTask?.title ?? "");
      setDescription(initialTask?.description ?? "");
      setDueDate(initialTask?.due_date ?? "");
      setAssignedTo(initialTask?.assigned_to ?? "");
      setError(null);
      setSubmitting(false);
      setTodayStr(todayLocalDate());
      setDatePickerOpen(false);
      setPersonPickerOpen(false);
      setDiscardDraftOpen(false);
    }
  }

  const isEdit = Boolean(initialTask);
  const assignedMember = members.find((member) => member.id === assignedTo);
  const pickerDate = new Date(`${dueDate || todayStr}T12:00:00`);

  const changeDate = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") setDatePickerOpen(false);
      if (event.type === "dismissed" || !date) return;
      setDueDate(toCalendarDate(date));
      setError(null);
    },
    [],
  );

  // Anything typed or changed since the sheet opened. A dirty form never
  // closes silently — backdrop tap and Android back both ask first, like
  // the web task-detail flow.
  const isDirty =
    title !== (initialTask?.title ?? "") ||
    description !== (initialTask?.description ?? "") ||
    dueDate !== (initialTask?.due_date ?? "") ||
    assignedTo !== (initialTask?.assigned_to ?? "");

  const requestClose = useCallback(() => {
    // A save in flight owns the sheet: closing now would hide a failure
    // behind the backdrop (or let a late success close a freshly
    // reopened draft). Close requests wait until the write resolves.
    if (submitting) return;
    if (!isDirty) {
      onClose();
      return;
    }
    setDiscardDraftOpen(true);
  }, [isDirty, onClose, submitting]);

  const submit = useCallback(async () => {
    // An unchanged date on an existing task may lie in the past (overdue)
    // — that is the task's reality, not a new mistake to reject.
    const dateUnchanged = isEdit && dueDate === (initialTask?.due_date ?? "");
    const validation = validateTaskInput(
      { title, description, dueDate, assignedTo },
      todayStr,
      dateUnchanged,
    );
    if (!validation.success) {
      setError(validation.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit({
        title: validation.data.title,
        description: validation.data.description,
        dueDate: validation.data.dueDate,
        assignedTo: validation.data.assignedTo,
      });
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.");
      }
    } catch {
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch's nochmal.");
    } finally {
      setSubmitting(false);
    }
  }, [assignedTo, description, dueDate, initialTask, isEdit, onClose, onSubmit, title, todayStr]);

  const [dismissOpen, setDismissOpen] = useState(false);

  const confirmDismiss = useCallback(() => {
    if (!onDismiss) return;
    setDismissOpen(true);
  }, [onDismiss]);

  return (
    <OrdiloFormSheet
        closeAccessibilityLabel="Aufgabe schließen"
        dismissDisabled={submitting}
        keyboardAvoiding
        onClose={requestClose}
        title={isEdit ? "Aufgabe bearbeiten" : "Aufgabe erstellen"}
        visible={visible}
      >
        <OrdiloFormBody>
          <OrdiloFormField label="Titel">
              <OrdiloFormInput
                accessibilityLabel="Titel der Aufgabe"
                autoCapitalize="sentences"
                maxLength={200}
                onChangeText={(value) => {
                  setTitle(value);
                  setError(null);
                }}
                placeholder="Zum Beispiel: Rechnung bezahlen"
                returnKeyType="done"
                value={title}
              />
          </OrdiloFormField>

          <OrdiloFormField label="Notiz (optional)">
              <OrdiloFormInput
                accessibilityLabel="Notiz zur Aufgabe"
                autoCapitalize="sentences"
                maxLength={2000}
                multiline
                onChangeText={setDescription}
                placeholder="Was gehört dazu?"
                value={description}
              />
          </OrdiloFormField>

          <OrdiloFormField label="Wann?">
            <OrdiloFormSelect
              accessibilityHint="Öffnet die Auswahl für das Datum"
              accessibilityLabel={`Datum: ${dueDate ? formatTaskDayHint(dueDate) : "Kein Termin"}`}
              leading={<View style={styles.selectionIcon}>
                <CalendarDays color={colors.harborBlue} size={20} strokeWidth={1.8} />
              </View>}
              onPress={() => setDatePickerOpen(true)}
              trailing={<ChevronRight color={colors.harborBlue} size={20} strokeWidth={2} />}
              value={dueDate ? formatTaskDayHint(dueDate) ?? "Datum wählen" : "Datum wählen"}
            />
          </OrdiloFormField>

          <OrdiloFormField label="Wer?">
            <OrdiloFormSelect
              accessibilityHint="Öffnet die Auswahl für die verantwortliche Person"
              accessibilityLabel={`Verantwortlich: ${assignedMember?.name ?? "Niemand"}`}
              leading={<View style={styles.selectionIcon}>
                <UserRound color={colors.harborBlue} size={20} strokeWidth={1.8} />
              </View>}
              onPress={() => setPersonPickerOpen(true)}
              trailing={<ChevronDown color={colors.harborBlue} size={20} strokeWidth={2} />}
              value={assignedMember?.name ?? "Verantwortliche Person wählen"}
            />
          </OrdiloFormField>
        </OrdiloFormBody>

        <OrdiloFormFooter
          after={isEdit && onDismiss ? (
            <Pressable
              accessibilityLabel="Aufgabe verwerfen"
              accessibilityRole="button"
              onPress={confirmDismiss}
              style={({ pressed }) => [
                styles.dismissButton,
                pressed && styles.cardPressed,
              ]}
            >
              <Trash2 color={colors.destructive} size={19} strokeWidth={1.8} />
              <Text style={styles.dismissLabel}>Aufgabe verwerfen</Text>
            </Pressable>
          ) : undefined}
          error={error}
          primary={<OrdiloButton
            disabled={submitting}
            icon={submitting
              ? <ActivityIndicator color={colors.warmWhite} size="small" />
              : <Heart color={colors.warmWhite} size={20} strokeWidth={1.9} />}
            onPress={() => void submit()}
            size="lg"
            title={submitting ? "Wird gespeichert …" : "Speichern"}
          />}
        />
        <ConfirmDialog
          cancelLabel="Weiter bearbeiten"
          contained
          confirmLabel="Verwerfen"
          message="Deine Eingaben gehen verloren."
          onCancel={() => setDiscardDraftOpen(false)}
          onConfirm={() => {
            setDiscardDraftOpen(false);
            onClose();
          }}
          title="Änderungen verwerfen?"
          visible={discardDraftOpen}
        />
        <ConfirmDialog
          contained
          confirmLabel="Verwerfen"
          message="Sie verschwindet aus der Liste. Du kannst das direkt danach rückgängig machen."
          onCancel={() => setDismissOpen(false)}
          onConfirm={() => {
            setDismissOpen(false);
            onDismiss?.();
          }}
          title="Aufgabe verwerfen?"
          visible={dismissOpen}
        />

      {datePickerOpen ? (
        <OrdiloNestedSheet
          closeAccessibilityLabel="Datumswahl schließen"
          contained
          onClose={() => setDatePickerOpen(false)}
          visible
        >
          <View style={styles.dateContent}>
            <OrdiloSheetHeader title="Datum wählen" />
            <Pressable
              accessibilityLabel="Keinen Termin festlegen"
              accessibilityRole="button"
              onPress={() => {
                setDueDate("");
                setError(null);
                setDatePickerOpen(false);
              }}
              style={styles.noDateButton}
            >
              <Text style={styles.noDateLabel}>Kein Termin</Text>
            </Pressable>
            <DateTimePicker
              accentColor={colors.harborBlue}
              display={Platform.OS === "ios" ? "inline" : "default"}
              locale="de-DE"
              mode="date"
              onChange={changeDate}
              themeVariant="light"
              value={pickerDate}
            />
            {Platform.OS === "ios" ? (
              <Pressable
                accessibilityLabel="Datum übernehmen"
                accessibilityRole="button"
                onPress={() => setDatePickerOpen(false)}
                style={styles.dateDoneButton}
              >
                <Text style={styles.dateDoneLabel}>Fertig</Text>
              </Pressable>
            ) : null}
          </View>
        </OrdiloNestedSheet>
      ) : null}

      <OrdiloPickerOverlay
        onClose={() => setPersonPickerOpen(false)}
        options={[
          ...members.map((member) => ({
            key: member.id,
            label: member.name,
            leading: (
              <View
                style={[
                  styles.pickerAvatar,
                  {
                    backgroundColor:
                      member.avatar_color ?? colors.sandLight,
                  },
                ]}
              >
                <Text style={styles.memberInitial}>
                  {member.name.trim().charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            ),
            onPress: () => {
              setAssignedTo(member.id);
              setError(null);
              setPersonPickerOpen(false);
            },
            selected: assignedTo === member.id,
          })),
          {
            key: "unassigned",
            label: "Niemandem",
            leading: (
              <View style={[styles.pickerAvatar, styles.unassignedAvatar]}>
                <Text style={styles.unassignedLabel}>–</Text>
              </View>
            ),
            onPress: () => {
              setAssignedTo("");
              setError(null);
              setPersonPickerOpen(false);
            },
            selected: assignedTo === "",
          },
        ]}
        title="Wer macht das?"
        visible={personPickerOpen}
      />
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  selectionIcon: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  cardPressed: {
    backgroundColor: colors.sandWarm,
  },
  memberInitial: {
    color: colors.warmWhite,
    ...typography.title,
  },
  dismissButton: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  dismissLabel: {
    color: colors.destructive,
    ...typography.title,
  },
  dateContent: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  noDateButton: {
    alignSelf: "flex-end",
    justifyContent: "center",
    marginBottom: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  noDateLabel: {
    color: colors.harborBlue,
    ...typography.timestamp,
  },
  dateDoneButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    justifyContent: "center",
    minHeight: 48,
  },
  dateDoneLabel: {
    color: colors.warmWhite,
    ...typography.title,
  },
  pickerAvatar: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  unassignedAvatar: {
    borderColor: colors.mistLight,
    borderStyle: "dashed",
    borderWidth: 1,
  },
  unassignedLabel: {
    color: colors.mistDark,
    ...typography.title,
  },
});
