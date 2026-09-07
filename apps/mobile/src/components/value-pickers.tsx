import { useCallback, useMemo, useState } from "react";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronDown, UserRound, Users } from "lucide-react-native";
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
import { formatGermanDate, toCalendarDate } from "@/src/lib/calendar";
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
        accessibilityLabel={`${accessibilityLabel}: ${formatted || value || "kein Datum"}`}
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
                // The inline picker always shows a day as selected — today,
                // when the field holds nothing readable. Tapping a different
                // day fires onChange, but accepting the one already shown
                // fires nothing, so "Fertig" commits it. Otherwise the field
                // stays empty while the screen claims a date, and the save
                // fails validation later for a reason nobody can see.
                onPress={() => { if (!formatted) onChange(toCalendarDate(pickerDate)); setOpen(false); }}
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
  // Only a live link counts. A person_id whose member is gone behaves like a
  // plain name, so the row stays editable instead of showing a dead avatar.
  const linked = people.find((person) => person.id === personId) ?? null;

  const options: OrdiloPickerOption[] = [
    ...people.map((person) => ({
      key: person.id,
      label: person.name,
      leading: <PersonAvatar person={{ name: person.name, color: person.avatar_color ?? null }} size={sizes.avatar} />,
      onPress: () => { onChange({ name: person.name, personId: person.id }); setOpen(false); },
      selected: linked?.id === person.id,
    })),
    {
      key: "__other__",
      hint: "Den Namen selbst eintippen",
      label: "Andere Person eintragen",
      leading: <View style={styles.otherAvatar}><UserRound color={colors.mistDark} size={17} strokeWidth={1.9} /></View>,
      // Unlinking clears the member's name; an already free name is kept, so
      // reopening the picker cannot wipe what someone just typed.
      onPress: () => { if (linked) onChange({ name: "", personId: null }); setOpen(false); },
      selected: !linked,
    },
  ];

  const picker = people.length > 0 ? (
    <OrdiloPickerSheet
      accessibilityLabel={accessibilityLabel}
      onClose={() => setOpen(false)}
      options={options}
      title="Wer ist gemeint?"
      visible={open}
    />
  ) : null;

  // One control either way: a linked person is a tap that reopens the choice,
  // anyone else is a normal name field with the family one tap away.
  if (linked) {
    return (
      <>
        <Pressable
          accessibilityHint="Öffnet die Personenauswahl"
          accessibilityLabel={`${accessibilityLabel}: ${linked.name}`}
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
        >
          <PersonAvatar person={{ name: linked.name, color: linked.avatar_color ?? null }} size={sizes.avatarSmall} />
          <Text numberOfLines={1} style={styles.controlValue}>{linked.name}</Text>
          <ChevronDown color={colors.mist} size={18} />
        </Pressable>
        {picker}
      </>
    );
  }

  return (
    <>
      <View style={styles.control}>
        <TextInput
          accessibilityLabel={accessibilityLabel}
          onChangeText={(value) => onChange({ name: value, personId: null })}
          placeholder="Vor- und Nachname"
          placeholderTextColor={colors.mistDark}
          style={styles.controlInput}
          value={name}
        />
        {people.length > 0 ? (
          <Pressable
            accessibilityHint="Wählt jemanden aus eurer Familie"
            accessibilityLabel={`${accessibilityLabel} aus der Familie wählen`}
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setOpen(true)}
            style={styles.controlAction}
          >
            <Users color={colors.harborBlue} size={19} strokeWidth={1.9} />
          </Pressable>
        ) : null}
      </View>
      {picker}
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
  controlInput: {
    color: colors.graphite,
    flex: 1,
    minHeight: sizes.touch,
    minWidth: 0,
    ...typography.body,
  },
  controlAction: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: -spacing.xs,
    minHeight: sizes.touch,
    width: sizes.touch,
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
