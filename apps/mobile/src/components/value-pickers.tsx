import { useCallback, useMemo, useState } from "react";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronDown, UserRound } from "lucide-react-native";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { OrdiloNestedSheet, OrdiloSheetHeader } from "./sheet";
import { OrdiloPickerSheet, type OrdiloPickerOption } from "./picker-sheet";
import { PersonAvatar } from "./person";
import { toCalendarDate } from "@/src/lib/calendar";
import { todayLocalDate } from "@/src/lib/tasks";
import { colors, radii, sizes, spacing, typography } from "@/src/theme/tokens";

/**
 * The two corrections people get wrong when they are asked to type them:
 * a date and a name. Both become a choice here — the system calendar and
 * the family the app already knows — so a correction cannot introduce a
 * date Ordilo can't read or a fourth spelling of the same person. Free
 * text stays reachable for a person outside the family, because a
 * document may well name one.
 */

/** "3. September 2026", or "" when the value is not a date we can show. */
export function formatGermanDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

export function DateValueField({
  accessibilityLabel,
  clearLabel,
  onChange,
  title = "Datum wählen",
  value,
}: {
  accessibilityLabel: string;
  /** Offer "kein Datum" — only where an empty value is actually allowed. */
  clearLabel?: string;
  onChange: (value: string) => void;
  title?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const formatted = formatGermanDate(value);
  // An unreadable stored value must stay visible; hiding it would let a
  // correction screen quietly claim a date that nobody can verify.
  const label = formatted || value || "Datum wählen";
  const pickerDate = useMemo(() => {
    const parsed = new Date(`${(formatted && value) || todayLocalDate()}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [formatted, value]);

  const change = useCallback((event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed" || !date) return;
    onChange(toCalendarDate(date));
  }, [onChange]);

  return (
    <>
      <Pressable
        accessibilityHint="Öffnet den Kalender"
        accessibilityLabel={`${accessibilityLabel}: ${formatted || "kein Datum"}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
      >
        <CalendarDays color={colors.mistDark} size={18} strokeWidth={1.9} />
        <Text numberOfLines={1} style={[styles.controlValue, !formatted && styles.controlPlaceholder]}>{label}</Text>
        <ChevronDown color={colors.mist} size={18} />
      </Pressable>
      {open ? (
        <OrdiloNestedSheet closeAccessibilityLabel="Datumswahl schließen" onClose={() => setOpen(false)} visible>
          <View style={styles.dateContent}>
            <OrdiloSheetHeader title={title} />
            {clearLabel ? (
              <Pressable
                accessibilityLabel={clearLabel}
                accessibilityRole="button"
                onPress={() => { onChange(""); setOpen(false); }}
                style={styles.quietButton}
              >
                <Text style={styles.quietButtonLabel}>{clearLabel}</Text>
              </Pressable>
            ) : null}
            <DateTimePicker
              accentColor={colors.harborBlue}
              display={Platform.OS === "ios" ? "inline" : "default"}
              locale="de-DE"
              mode="date"
              onChange={change}
              themeVariant="light"
              value={pickerDate}
            />
            {Platform.OS === "ios" ? (
              <Pressable
                accessibilityLabel="Datum übernehmen"
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={styles.doneButton}
              >
                <Text style={styles.doneLabel}>Fertig</Text>
              </Pressable>
            ) : null}
          </View>
        </OrdiloNestedSheet>
      ) : null}
    </>
  );
}

export interface PersonChoice {
  id: string;
  name: string;
  avatar_color?: string | null;
}

export function PersonValueField({
  accessibilityLabel,
  name,
  onChange,
  people,
  personId,
}: {
  accessibilityLabel: string;
  name: string;
  /** A known person carries their id; a free-text name has none. */
  onChange: (value: { name: string; personId: string | null }) => void;
  people: PersonChoice[];
  personId: string | null;
}) {
  const [open, setOpen] = useState(false);
  // A name nobody in the family is linked to stays editable as text, so
  // fixing a spelling never costs a detour through the picker.
  const [freeText, setFreeText] = useState(() => Boolean(name) && !personId);
  const known = people.find((person) => person.id === personId)
    ?? people.find((person) => person.name.trim().toLocaleLowerCase("de") === name.trim().toLocaleLowerCase("de"));

  const options: OrdiloPickerOption[] = [
    ...people.map((person) => ({
      key: person.id,
      label: person.name,
      leading: <PersonAvatar person={{ name: person.name, color: person.avatar_color ?? null }} size={sizes.avatar} />,
      onPress: () => { setFreeText(false); onChange({ name: person.name, personId: person.id }); setOpen(false); },
      selected: known?.id === person.id && !freeText,
    })),
    {
      key: "__other__",
      hint: "Jemand, der nicht zur Familie gehört",
      label: "Andere Person eintragen",
      leading: <View style={styles.otherAvatar}><UserRound color={colors.mistDark} size={17} strokeWidth={1.9} /></View>,
      onPress: () => { setFreeText(true); onChange({ name: known && !freeText ? "" : name, personId: null }); setOpen(false); },
      selected: freeText,
    },
  ];

  // Nothing to pick from means no picker: an empty list would be a menu
  // with a single "someone else" entry in it.
  if (people.length === 0) {
    return (
      <TextInput
        accessibilityLabel={accessibilityLabel}
        onChangeText={(value) => onChange({ name: value, personId: null })}
        placeholder="Vor- und Nachname"
        placeholderTextColor={colors.mistDark}
        style={styles.input}
        value={name}
      />
    );
  }

  return (
    <>
      <Pressable
        accessibilityHint="Öffnet die Personenauswahl"
        accessibilityLabel={`${accessibilityLabel}: ${name || "keine Person"}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
      >
        {known && !freeText
          ? <PersonAvatar person={{ name: known.name, color: known.avatar_color ?? null }} size={sizes.avatarSmall} />
          : <UserRound color={colors.mistDark} size={18} strokeWidth={1.9} />}
        <Text numberOfLines={1} style={[styles.controlValue, !name && styles.controlPlaceholder]}>
          {freeText && !name ? "Andere Person" : name || "Person wählen"}
        </Text>
        <ChevronDown color={colors.mist} size={18} />
      </Pressable>
      {freeText ? (
        <TextInput
          accessibilityLabel={`${accessibilityLabel}, Name`}
          onChangeText={(value) => onChange({ name: value, personId: null })}
          placeholder="Vor- und Nachname"
          placeholderTextColor={colors.mistDark}
          style={styles.input}
          value={name}
        />
      ) : null}
      <OrdiloPickerSheet
        accessibilityLabel={accessibilityLabel}
        onClose={() => setOpen(false)}
        options={options}
        title="Wer ist gemeint?"
        visible={open}
      />
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.sm,
  },
  controlPressed: { backgroundColor: colors.sandWarm },
  controlValue: { color: colors.graphite, flex: 1, minWidth: 0, ...typography.body },
  controlPlaceholder: { color: colors.mistDark },
  input: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.sm,
    ...typography.body,
  },
  otherAvatar: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: sizes.avatar / 2,
    height: sizes.avatar,
    justifyContent: "center",
    width: sizes.avatar,
  },
  dateContent: { alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  quietButton: { alignItems: "center", borderColor: colors.mistLight, borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: sizes.touch, paddingHorizontal: spacing.md },
  quietButtonLabel: { color: colors.mistDark, ...typography.title },
  doneButton: { alignItems: "center", backgroundColor: colors.harborBlue, borderRadius: radii.sm, justifyContent: "center", minHeight: sizes.touch, paddingHorizontal: spacing.xl },
  doneLabel: { color: colors.warmWhite, ...typography.title },
});
