import { useCallback, useState } from "react";
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
import {
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Pencil,
} from "lucide-react-native";

import { OrdiloFormSheet } from "./sheet";
import { OrdiloButton } from "./ui";
import {
  formatEventDateInput,
  parseEventDateInput,
  validatePlannerEventInput,
  type PlannerEventInput,
} from "@/src/lib/calendar";
import type { FamilyMemberOption } from "@/src/lib/tasks";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function EventFormSheet({
  defaultDate,
  members,
  onClose,
  onSubmit,
  visible,
}: {
  defaultDate: string;
  members: FamilyMemberOption[];
  onClose: () => void;
  onSubmit: (
    values: PlannerEventInput,
  ) => Promise<{ success: boolean; error?: string }>;
  visible: boolean;
}) {
  const [title, setTitle] = useState("");
  const [dateInput, setDateInput] = useState(formatEventDateInput(defaultDate));
  const [allDay, setAllDay] = useState(true);
  const [startsTime, setStartsTime] = useState("09:00");
  const [endsTime, setEndsTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setTitle("");
      setDateInput(formatEventDateInput(defaultDate));
      setAllDay(true);
      setStartsTime("09:00");
      setEndsTime("10:00");
      setLocation("");
      setNote("");
      setAttendeeIds([]);
      setError(null);
      setSubmitting(false);
    }
  }

  const isDirty =
    title.trim() !== "" ||
    dateInput !== formatEventDateInput(defaultDate) ||
    !allDay ||
    location.trim() !== "" ||
    note.trim() !== "" ||
    attendeeIds.length > 0;

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert("Änderungen verwerfen?", "Deine Eingaben gehen verloren.", [
      { style: "cancel", text: "Weiter bearbeiten" },
      { onPress: onClose, style: "destructive", text: "Verwerfen" },
    ]);
  }, [isDirty, onClose, submitting]);

  const toggleAttendee = useCallback((memberId: string) => {
    setAttendeeIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }, []);

  const submit = useCallback(async () => {
    const date = parseEventDateInput(dateInput);
    if (!date) {
      setError("Bitte gib ein gültiges Datum ein, zum Beispiel 28.08.2026.");
      return;
    }
    const values: PlannerEventInput = {
      title,
      date,
      allDay,
      startsTime,
      endsTime,
      location,
      note,
      attendeeIds,
    };
    const validation = validatePlannerEventInput(values);
    if (!validation.success) {
      setError(validation.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(validation.data);
      if (result.success) onClose();
      else setError(result.error ?? "Der Termin konnte nicht gespeichert werden.");
    } catch {
      setError("Keine Verbindung. Bitte prüfe dein Internet und versuch's nochmal.");
    } finally {
      setSubmitting(false);
    }
  }, [
    allDay,
    attendeeIds,
    dateInput,
    endsTime,
    location,
    note,
    onClose,
    onSubmit,
    startsTime,
    title,
  ]);

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Termin schließen"
      dismissDisabled={submitting}
      keyboardAvoiding
      onClose={requestClose}
      style={styles.formSheet}
      title="Neuer Termin"
      visible={visible}
    >
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.formBody}
      >
        <Text style={styles.fieldLabel}>Was ist geplant?</Text>
        <View style={styles.inputShell}>
          <CalendarDays color={colors.harborBlue} size={18} strokeWidth={1.8} />
          <TextInput
            accessibilityLabel="Titel des Termins"
            autoCapitalize="sentences"
            maxLength={160}
            onChangeText={(value) => {
              setTitle(value);
              setError(null);
            }}
            placeholder="Zum Beispiel: Elternabend"
            placeholderTextColor={colors.mistDark}
            returnKeyType="next"
            style={styles.input}
            value={title}
          />
        </View>

        <Text style={styles.fieldLabel}>Datum</Text>
        <View style={styles.inputShell}>
          <CalendarDays color={colors.harborBlue} size={18} strokeWidth={1.8} />
          <TextInput
            accessibilityLabel="Datum des Termins"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={(value) => {
              setDateInput(value);
              setError(null);
            }}
            placeholder="TT.MM.JJJJ"
            placeholderTextColor={colors.mistDark}
            returnKeyType="done"
            style={styles.input}
            value={dateInput}
          />
        </View>

        <Pressable
          accessibilityLabel="Ganztägiger Termin"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allDay }}
          onPress={() => setAllDay((current) => !current)}
          style={styles.checkRow}
        >
          <View style={[styles.checkbox, allDay && styles.checkboxSelected]}>
            {allDay ? (
              <Check color={colors.warmWhite} size={16} strokeWidth={2.4} />
            ) : null}
          </View>
          <Text style={styles.checkLabel}>Ganztägig</Text>
        </Pressable>

        {!allDay ? (
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>Beginn</Text>
              <View style={styles.inputShell}>
                <Clock3 color={colors.harborBlue} size={18} strokeWidth={1.8} />
                <TextInput
                  accessibilityLabel="Beginn des Termins"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  onChangeText={setStartsTime}
                  placeholder="09:00"
                  placeholderTextColor={colors.mistDark}
                  style={styles.input}
                  value={startsTime}
                />
              </View>
            </View>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>Ende</Text>
              <View style={styles.inputShell}>
                <Clock3 color={colors.harborBlue} size={18} strokeWidth={1.8} />
                <TextInput
                  accessibilityLabel="Ende des Termins"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  onChangeText={setEndsTime}
                  placeholder="10:00"
                  placeholderTextColor={colors.mistDark}
                  style={styles.input}
                  value={endsTime}
                />
              </View>
            </View>
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>Ort (optional)</Text>
        <View style={styles.inputShell}>
          <MapPin color={colors.harborBlue} size={18} strokeWidth={1.8} />
          <TextInput
            accessibilityLabel="Ort des Termins"
            autoCapitalize="sentences"
            maxLength={300}
            onChangeText={setLocation}
            placeholder="Wo trefft ihr euch?"
            placeholderTextColor={colors.mistDark}
            style={styles.input}
            value={location}
          />
        </View>

        <Text style={styles.fieldLabel}>Notiz (optional)</Text>
        <View style={[styles.inputShell, styles.noteShell]}>
          <Pencil color={colors.harborBlue} size={18} strokeWidth={1.8} />
          <TextInput
            accessibilityLabel="Notiz zum Termin"
            autoCapitalize="sentences"
            maxLength={2000}
            multiline
            onChangeText={setNote}
            placeholder="Was soll die Familie wissen?"
            placeholderTextColor={colors.mistDark}
            style={[styles.input, styles.noteInput]}
            textAlignVertical="top"
            value={note}
          />
        </View>

        {members.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>Wer ist dabei?</Text>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              <View style={styles.memberRow}>
                {members.map((member) => {
                  const selected = attendeeIds.includes(member.id);
                  return (
                    <Pressable
                      accessibilityLabel={`${member.name} ist dabei`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={member.id}
                      onPress={() => toggleAttendee(member.id)}
                      style={[
                        styles.memberChip,
                        selected && styles.memberChipSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.memberCircle,
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
                      <Text numberOfLines={1} style={styles.memberName}>
                        {member.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
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
          title={submitting ? "Wird gespeichert …" : "Termin anlegen"}
        />
      </View>
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  formSheet: { height: "88%" },
  formBody: { flex: 1 },
  formContent: {
    paddingBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.mistDark,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    ...typography.label,
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
  input: {
    color: colors.graphite,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.body,
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.mistLight,
    borderRadius: 7,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  checkboxSelected: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  checkLabel: { color: colors.graphite, ...typography.body },
  timeRow: { flexDirection: "row", gap: spacing.sm },
  timeField: { flex: 1 },
  noteShell: {
    alignItems: "flex-start",
    minHeight: 84,
    paddingTop: spacing.sm,
  },
  noteInput: { minHeight: 68, paddingTop: 0 },
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
    padding: spacing.sm,
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
  memberInitial: { color: colors.warmWhite, ...typography.title },
  memberName: {
    color: colors.graphite,
    textAlign: "center",
    ...typography.label,
  },
  footer: {
    backgroundColor: colors.warmWhite,
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorText: { color: colors.destructive, ...typography.timestamp },
});
