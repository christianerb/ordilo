import { useCallback, useState } from "react";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Heart,
  Sprout,
  Trash2,
  UserRound,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ConfirmDialog } from "./confirm-dialog";
import { OrdiloPickerOverlay } from "./picker-sheet";
import { OrdiloFormSheet } from "./sheet";
import { cardRestShadow } from "./ui";
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
    Alert.alert(
      "Änderungen verwerfen?",
      "Deine Eingaben gehen verloren.",
      [
        { style: "cancel", text: "Weiter bearbeiten" },
        { onPress: onClose, style: "destructive", text: "Verwerfen" },
      ],
    );
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
        style={styles.formSheet}
        title={isEdit ? "Aufgabe bearbeiten" : "Aufgabe erstellen"}
        titleAlign="center"
        visible={visible}
      >
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.decoration}
        >
          <Sprout color={colors.harborBlue} size={72} strokeWidth={1.2} />
        </View>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.noteDecoration}
        >
          <Sprout color={colors.harborBlue} size={54} strokeWidth={1.2} />
        </View>

        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.formBody}
        >
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Titel</Text>
            <View style={styles.inputCard}>
              <TextInput
                accessibilityLabel="Titel der Aufgabe"
                autoCapitalize="sentences"
                maxLength={200}
                onChangeText={(value) => {
                  setTitle(value);
                  setError(null);
                }}
                placeholder="Zum Beispiel: Rechnung bezahlen"
                placeholderTextColor={colors.mistDark}
                returnKeyType="done"
                style={styles.input}
                value={title}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Notiz (optional)</Text>
            <View style={[styles.inputCard, styles.noteCard]}>
              <TextInput
                accessibilityLabel="Notiz zur Aufgabe"
                autoCapitalize="sentences"
                maxLength={2000}
                multiline
                onChangeText={setDescription}
                placeholder="Was gehört dazu?"
                placeholderTextColor={colors.mistDark}
                style={[styles.input, styles.noteInput]}
                textAlignVertical="top"
                value={description}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Wann?</Text>
            <Pressable
              accessibilityHint="Öffnet die Auswahl für das Datum"
              accessibilityLabel={`Datum: ${dueDate ? formatTaskDayHint(dueDate) : "Kein Termin"}`}
              accessibilityRole="button"
              onPress={() => setDatePickerOpen(true)}
              style={({ pressed }) => [
                styles.selectionCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.selectionIcon}>
                <CalendarDays color={colors.harborBlue} size={20} strokeWidth={1.8} />
              </View>
              <Text style={styles.selectionText}>
                {dueDate ? formatTaskDayHint(dueDate) : "Datum wählen"}
              </Text>
              <ChevronRight color={colors.harborBlue} size={20} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Wer?</Text>
            <Pressable
              accessibilityHint="Öffnet die Auswahl für die verantwortliche Person"
              accessibilityLabel={`Verantwortlich: ${assignedMember?.name ?? "Niemand"}`}
              accessibilityRole="button"
              onPress={() => setPersonPickerOpen(true)}
              style={({ pressed }) => [
                styles.selectionCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.selectionIcon}>
                <UserRound color={colors.harborBlue} size={20} strokeWidth={1.8} />
              </View>
              <Text style={styles.selectionText}>
                {assignedMember?.name ?? "Verantwortliche Person wählen"}
              </Text>
              <ChevronDown color={colors.harborBlue} size={20} strokeWidth={2} />
            </Pressable>

          </View>
        </ScrollView>

        <View style={styles.footer}>
          {error ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityLabel="Aufgabe speichern"
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              submitting && styles.buttonDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : (
              <Heart color={colors.warmWhite} size={20} strokeWidth={1.9} />
            )}
            <Text style={styles.saveLabel}>
              {submitting ? "Wird gespeichert …" : "Speichern"}
            </Text>
          </Pressable>

          {isEdit && onDismiss ? (
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
          ) : null}
        </View>
        <ConfirmDialog
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
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={styles.dateOverlay}
        >
          <Pressable
            accessibilityLabel="Datumswahl schließen"
            accessibilityRole="button"
            onPress={() => setDatePickerOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.datePanel}>
            <View style={styles.dateHandle} />
            <View style={styles.dateHeader}>
              <Text style={styles.dateTitle}>Datum wählen</Text>
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
            </View>
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
        </View>
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
  formSheet: {
    height: "96%",
    maxHeight: "96%",
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
  },
  formBody: {
    flex: 1,
  },
  formContent: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    color: colors.harborBlue,
    ...typography.timestamp,
  },
  input: {
    color: colors.graphite,
    flex: 1,
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  inputCard: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 64,
    ...cardRestShadow,
  },
  noteCard: {
    minHeight: 132,
  },
  noteInput: {
    minHeight: 130,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  selectionCard: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    padding: 12,
    ...cardRestShadow,
  },
  selectionIcon: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  selectionText: {
    color: colors.graphite,
    flex: 1,
    ...typography.title,
  },
  cardPressed: {
    backgroundColor: colors.sandWarm,
  },
  memberInitial: {
    color: colors.warmWhite,
    ...typography.title,
  },
  errorBox: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    ...typography.timestamp,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  saveButtonPressed: {
    backgroundColor: colors.harborBlueDark,
  },
  buttonDisabled: {
    opacity: 0.56,
  },
  saveLabel: {
    color: colors.warmWhite,
    ...typography.title,
  },
  dismissButton: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
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
  decoration: {
    left: -20,
    opacity: 0.16,
    position: "absolute",
    top: 24,
    transform: [{ rotate: "-24deg" }],
  },
  noteDecoration: {
    opacity: 0.16,
    position: "absolute",
    right: -14,
    top: 330,
    transform: [{ rotate: "32deg" }],
  },
  dateOverlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    bottom: 0,
    elevation: 20,
    justifyContent: "flex-end",
    left: 0,
    padding: spacing.md,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  datePanel: {
    backgroundColor: colors.warmWhite,
    borderRadius: radii.xl,
    overflow: "hidden",
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dateHandle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    width: 40,
  },
  dateHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  dateTitle: {
    color: colors.graphite,
    ...typography.display,
  },
  noDateButton: {
    justifyContent: "center",
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
