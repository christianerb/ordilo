import { useCallback, useState } from "react";
import { CalendarDays, Check, Pencil } from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrdiloFormSheet } from "./sheet";
import { OrdiloButton } from "./ui";
import {
  formatTaskDayHint,
  resolveSchedulePreset,
  TASK_SCHEDULE_PRESET_LABELS,
  TASK_SCHEDULE_PRESETS,
  todayLocalDate,
  validateTaskInput,
  type FamilyMemberOption,
  type PlannerTask,
} from "@/src/lib/tasks";
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
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayStr, setTodayStr] = useState(todayLocalDate());

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
    }
  }

  const isEdit = Boolean(initialTask);

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

  const confirmDismiss = useCallback(() => {
    if (!onDismiss) return;
    Alert.alert(
      "Aufgabe verwerfen?",
      "Sie verschwindet aus der Liste. Du kannst das direkt danach rückgängig machen.",
      [
        { style: "cancel", text: "Abbrechen" },
        { onPress: onDismiss, style: "destructive", text: "Verwerfen" },
      ],
    );
  }, [onDismiss]);

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Aufgabe schließen"
      onClose={requestClose}
      style={styles.formSheet}
      title={isEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
      visible={visible}
    >
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.formBody}
      >
            <Text style={styles.fieldLabel}>Titel</Text>
            <View style={styles.inputShell}>
              <Check color={colors.harborBlue} size={18} strokeWidth={2} />
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

            <Text style={styles.fieldLabel}>Notiz (optional)</Text>
            <View style={[styles.inputShell, styles.noteShell]}>
              <Pencil color={colors.harborBlue} size={18} strokeWidth={1.8} />
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

            <Text style={styles.fieldLabel}>Wann?</Text>
            <View style={styles.dateSummary}>
              <CalendarDays color={colors.graphite} size={18} strokeWidth={1.8} />
              <Text style={styles.dateSummaryText}>
                {dueDate ? formatTaskDayHint(dueDate) : "Kein Termin"}
              </Text>
            </View>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroller}
            >
              <View style={styles.chipRow}>
                {TASK_SCHEDULE_PRESETS.map((preset) => {
                  const date = resolveSchedulePreset(preset, todayStr);
                  const selected =
                    preset === "none" ? dueDate === "" : date !== null && dueDate === date;
                  const hint = formatTaskDayHint(date);
                  return (
                    <Pressable
                      accessibilityHint={hint ?? undefined}
                      accessibilityLabel={TASK_SCHEDULE_PRESET_LABELS[preset]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={preset}
                      onPress={() => setDueDate(selected ? "" : (date ?? ""))}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                        {TASK_SCHEDULE_PRESET_LABELS[preset]}
                      </Text>
                      {hint ? (
                        <Text style={[styles.chipHint, selected && styles.chipHintSelected]}>
                          {hint}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.fieldLabel}>Wer?</Text>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              <View style={styles.memberRow}>
                <Pressable
                  accessibilityLabel="Niemandem zuordnen"
                  accessibilityRole="button"
                  accessibilityState={{ selected: assignedTo === "" }}
                  onPress={() => setAssignedTo("")}
                  style={[styles.memberChip, assignedTo === "" && styles.memberChipSelected]}
                >
                  <View style={styles.memberCircleEmpty}>
                    <Text style={styles.memberCircleEmptyText}>–</Text>
                  </View>
                  <Text style={styles.memberName}>Niemandem</Text>
                </Pressable>
                {members.map((member) => {
                  const selected = assignedTo === member.id;
                  return (
                    <Pressable
                      accessibilityLabel={`Aufgabe an ${member.name} geben`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={member.id}
                      onPress={() => setAssignedTo(selected ? "" : member.id)}
                      style={[styles.memberChip, selected && styles.memberChipSelected]}
                    >
                      <View
                        style={[
                          styles.memberCircle,
                          { backgroundColor: member.avatar_color ?? colors.sandLight },
                        ]}
                      >
                        <Text style={styles.memberInitial}>
                          {member.name.trim().charAt(0).toUpperCase() || "?"}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.memberName}>
                        {member.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom) }]}>
        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <OrdiloButton
          disabled={submitting}
          icon={
            submitting ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : undefined
          }
          onPress={() => void submit()}
          size="lg"
          title={
            submitting
              ? "Wird gespeichert …"
              : isEdit
                ? "Speichern"
                : "Aufgabe anlegen"
          }
        />
        {isEdit && onDismiss ? (
          <Pressable
            accessibilityLabel="Aufgabe verwerfen"
            accessibilityRole="button"
            onPress={confirmDismiss}
            style={styles.dismissButton}
          >
            <Text style={styles.dismissLabel}>Aufgabe verwerfen</Text>
          </Pressable>
        ) : null}
      </View>
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  formSheet: { height: "88%" },
  formBody: {
    flex: 1,
  },
  formContent: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  fieldLabel: {
    color: colors.mistDark,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    ...typography.label,
  },
  input: {
    color: colors.graphite,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.body,
  },
  inputShell: {
    alignItems: "center",
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingLeft: spacing.sm,
  },
  noteShell: {
    alignItems: "flex-start",
    minHeight: 84,
    paddingTop: spacing.sm,
  },
  noteInput: {
    minHeight: 68,
    paddingTop: 0,
  },
  dateSummary: {
    alignItems: "center",
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  dateSummaryText: {
    color: colors.graphite,
    ...typography.timestamp,
  },
  presetScroller: {
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 78,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  chipLabel: {
    color: colors.mistDark,
    ...typography.label,
    fontSize: 14,
    lineHeight: 18,
  },
  chipLabelSelected: {
    color: colors.warmWhite,
  },
  chipHint: {
    color: colors.mistDark,
    ...typography.label,
  },
  chipHintSelected: {
    color: colors.warmWhite,
  },
  memberRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  memberChip: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: 72,
  },
  memberChipSelected: {
    backgroundColor: "rgba(48, 84, 96, 0.08)",
    borderColor: colors.harborBlue,
  },
  memberCircle: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  memberCircleEmpty: {
    alignItems: "center",
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderStyle: "dashed",
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  memberCircleEmptyText: {
    color: colors.mistDark,
    ...typography.title,
  },
  memberInitial: {
    color: colors.warmWhite,
    ...typography.title,
  },
  memberName: {
    color: colors.graphite,
    textAlign: "center",
    ...typography.label,
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
    backgroundColor: colors.warmWhite,
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  dismissButton: {
    alignItems: "center",
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  dismissLabel: {
    color: colors.destructive,
    ...typography.title,
  },
});
