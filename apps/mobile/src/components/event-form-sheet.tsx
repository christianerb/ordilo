import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Pencil,
} from "lucide-react-native";

import { ConfirmDialog } from "./confirm-dialog";
import {
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormInput,
  OrdiloFormSheet,
} from "./sheet";
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
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);

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
      setDiscardDraftOpen(false);
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
    setDiscardDraftOpen(true);
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
      title="Neuer Termin"
      visible={visible}
    >
      <OrdiloFormBody>
        <OrdiloFormField label="Was ist geplant?">
          <OrdiloFormInput
            accessibilityLabel="Titel des Termins"
            autoCapitalize="sentences"
            leading={<CalendarDays color={colors.harborBlue} size={18} strokeWidth={1.8} />}
            maxLength={160}
            onChangeText={(value) => {
              setTitle(value);
              setError(null);
            }}
            placeholder="Zum Beispiel: Elternabend"
            returnKeyType="next"
            value={title}
          />
        </OrdiloFormField>

        <OrdiloFormField label="Datum">
          <OrdiloFormInput
            accessibilityLabel="Datum des Termins"
            keyboardType="numbers-and-punctuation"
            leading={<CalendarDays color={colors.harborBlue} size={18} strokeWidth={1.8} />}
            maxLength={10}
            onChangeText={(value) => {
              setDateInput(value);
              setError(null);
            }}
            placeholder="TT.MM.JJJJ"
            returnKeyType="done"
            value={dateInput}
          />
        </OrdiloFormField>

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
            <OrdiloFormField label="Beginn" style={styles.timeField}>
                <OrdiloFormInput
                  accessibilityLabel="Beginn des Termins"
                  keyboardType="numbers-and-punctuation"
                  leading={<Clock3 color={colors.harborBlue} size={18} strokeWidth={1.8} />}
                  maxLength={5}
                  onChangeText={setStartsTime}
                  placeholder="09:00"
                  value={startsTime}
                />
            </OrdiloFormField>
            <OrdiloFormField label="Ende" style={styles.timeField}>
                <OrdiloFormInput
                  accessibilityLabel="Ende des Termins"
                  keyboardType="numbers-and-punctuation"
                  leading={<Clock3 color={colors.harborBlue} size={18} strokeWidth={1.8} />}
                  maxLength={5}
                  onChangeText={setEndsTime}
                  placeholder="10:00"
                  value={endsTime}
                />
            </OrdiloFormField>
          </View>
        ) : null}

        <OrdiloFormField label="Ort (optional)">
          <OrdiloFormInput
            accessibilityLabel="Ort des Termins"
            autoCapitalize="sentences"
            leading={<MapPin color={colors.harborBlue} size={18} strokeWidth={1.8} />}
            maxLength={300}
            onChangeText={setLocation}
            placeholder="Wo trefft ihr euch?"
            value={location}
          />
        </OrdiloFormField>

        <OrdiloFormField label="Notiz (optional)">
          <OrdiloFormInput
            accessibilityLabel="Notiz zum Termin"
            autoCapitalize="sentences"
            leading={<Pencil color={colors.harborBlue} size={18} strokeWidth={1.8} />}
            maxLength={2000}
            multiline
            onChangeText={setNote}
            placeholder="Was soll die Familie wissen?"
            value={note}
          />
        </OrdiloFormField>

        {members.length > 0 ? (
          <OrdiloFormField label="Wer ist dabei?">
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
          </OrdiloFormField>
        ) : null}
      </OrdiloFormBody>

      <OrdiloFormFooter
        error={error}
        primary={<OrdiloButton
          disabled={submitting}
          icon={
            submitting ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : undefined
          }
          onPress={() => void submit()}
          size="lg"
          title={submitting ? "Wird gespeichert …" : "Termin anlegen"}
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
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
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
});
