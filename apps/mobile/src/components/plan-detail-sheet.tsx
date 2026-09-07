import {
  CalendarDays,
  CalendarX2,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  ListChecks,
  MapPin,
  Pencil,
  Repeat,
  Trash2,
  Undo2,
  UserRound,
  Users,
} from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AvatarStack } from "./person";
import { OrdiloFormSheet } from "./sheet";
import { OrdiloButton } from "./ui";
import {
  formatGermanDate,
  formatEventWhen,
  RECURRENCE_LABELS,
} from "@/src/lib/calendar";
import { memberToPerson } from "@/src/lib/people";
import {
  formatPlanEntryPeople,
  formatPlanEntryWhen,
  isPlanEntryOverdue,
  planEntryMemberIds,
  type PlanEntry,
} from "@/src/lib/plan-entries";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import type { FamilyMemberOption } from "@/src/lib/tasks";

/**
 * Everything the sheet can hand back. Each one closes the sheet first —
 * the follow-up (a form, a picker, a confirmation) is another layer, and
 * two stacked modals fight each other on iOS.
 */
export type PlanDetailAction =
  /** Tick a task off, or re-open a finished one. */
  | { type: "toggle-done" }
  /** Open the create/edit form for this entry. */
  | { type: "edit" }
  /** Task only: the "Wann?" preset picker. */
  | { type: "reschedule" }
  /** Task only: the "Wer macht das?" picker. */
  | { type: "assign" }
  /** Task only: take it off the list without pretending it was done. */
  | { type: "dismiss" }
  /** Appointment only: remove it for the whole family. */
  | { type: "delete" }
  /** Appointment only: drop this one day out of a repeating series. */
  | { type: "skip-occurrence" }
  /** Jump to the document this entry was read out of. */
  | { type: "open-document"; documentId: string };

/**
 * The one detail view for a plan entry — an Aufgabe or a Termin.
 *
 * Beide sind dasselbe Anliegen in zwei Formen, also lesen sie sich hier
 * gleich: zuerst was es ist, dann wann, wo und wer, und darunter die
 * Aktionen, die dazu passen. Vorher konnte man einen Termin gar nicht
 * öffnen; jetzt führt jede Zeile im Plan an denselben Ort.
 */
export function PlanDetailSheet({
  entry,
  members,
  onAction,
  onClose,
  onDismissed,
  todayStr,
  visible,
}: {
  entry: PlanEntry | null;
  members: FamilyMemberOption[];
  onAction: (action: PlanDetailAction) => void;
  onClose: () => void;
  /** Fires after the exit animation, so a follow-up sheet can open. */
  onDismissed?: () => void;
  todayStr: string;
  visible: boolean;
}) {
  const isTask = entry?.kind === "task";
  const done = isTask && entry.task.status === "done";

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel={isTask ? "Aufgabe schließen" : "Termin schließen"}
      onClose={onClose}
      onDismiss={onDismissed}
      subtitle={
        entry ? (formatPlanEntryWhen(entry, todayStr) ?? undefined) : undefined
      }
      title={isTask ? "Aufgabe" : "Termin"}
      visible={visible}
    >
      {entry ? (
        <>
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            style={styles.bodyScroll}
          >
            <View style={styles.hero}>
              <View
                style={[
                  styles.heroTile,
                  entry.kind === "event" && styles.heroTileEvent,
                  done && styles.heroTileDone,
                ]}
              >
                {done ? (
                  <Check color={colors.warmWhite} size={24} strokeWidth={2.6} />
                ) : entry.kind === "event" ? (
                  <CalendarDays
                    color={colors.harborBlue}
                    size={24}
                    strokeWidth={1.8}
                  />
                ) : (
                  <ListChecks
                    color={colors.harborBlue}
                    size={24}
                    strokeWidth={1.8}
                  />
                )}
              </View>
              <View style={styles.heroCopy}>
                <Text style={[styles.heroTitle, done && styles.heroTitleDone]}>
                  {entry.kind === "task" ? entry.task.title : entry.event.title}
                </Text>
                <PlanDetailStatus entry={entry} todayStr={todayStr} />
              </View>
            </View>

            <View style={styles.facts}>
              {buildFacts(entry, members).map((fact, index) => (
                <FactRow
                  first={index === 0}
                  icon={fact.icon}
                  key={fact.label}
                  label={fact.label}
                  trailing={fact.trailing}
                  value={fact.value}
                />
              ))}
              <DocumentFact entry={entry} onAction={onAction} />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {entry.kind === "task" ? (
              <>
                <OrdiloButton
                  icon={
                    done ? (
                      <Undo2 color={colors.graphite} size={19} strokeWidth={2} />
                    ) : (
                      <Check
                        color={colors.warmWhite}
                        size={19}
                        strokeWidth={2.4}
                      />
                    )
                  }
                  onPress={() => onAction({ type: "toggle-done" })}
                  size="lg"
                  title={done ? "Wieder offen" : "Erledigt"}
                  variant={done ? "outline" : "primary"}
                />
                <View style={styles.footerRow}>
                  <QuietAction
                    icon={CalendarDays}
                    label="Wann?"
                    onPress={() => onAction({ type: "reschedule" })}
                  />
                  <QuietAction
                    icon={UserRound}
                    label="Wer?"
                    onPress={() => onAction({ type: "assign" })}
                  />
                  <QuietAction
                    icon={Pencil}
                    label="Ändern"
                    onPress={() => onAction({ type: "edit" })}
                  />
                </View>
                <OrdiloButton
                  onPress={() => onAction({ type: "dismiss" })}
                  title="Brauchen wir nicht"
                  variant="ghost"
                />
              </>
            ) : (
              <>
                <OrdiloButton
                  icon={<Pencil color={colors.warmWhite} size={19} strokeWidth={2} />}
                  onPress={() => onAction({ type: "edit" })}
                  size="lg"
                  title="Termin ändern"
                />
                {entry.event.recurrence !== "none" ? (
                  <OrdiloButton
                    icon={
                      <CalendarX2
                        color={colors.graphite}
                        size={18}
                        strokeWidth={2}
                      />
                    }
                    onPress={() => onAction({ type: "skip-occurrence" })}
                    title="Nur diesen Tag streichen"
                    variant="outline"
                  />
                ) : null}
                <OrdiloButton
                  icon={
                    <Trash2 color={colors.destructive} size={18} strokeWidth={2} />
                  }
                  onPress={() => onAction({ type: "delete" })}
                  title={
                    entry.event.recurrence === "none"
                      ? "Termin löschen"
                      : "Ganze Serie löschen"
                  }
                  variant="ghost"
                />
              </>
            )}
          </View>
        </>
      ) : null}
    </OrdiloFormSheet>
  );
}

/** "Heute", "Seit 3 Tagen offen", "Erledigt" — the one status line. */
function PlanDetailStatus({
  entry,
  todayStr,
}: {
  entry: PlanEntry;
  todayStr: string;
}) {
  const done = entry.kind === "task" && entry.task.status === "done";
  const overdue = isPlanEntryOverdue(entry, todayStr);
  const when = formatPlanEntryWhen(entry, todayStr);

  if (done) {
    return (
      <View style={[styles.statusPill, styles.statusPillDone]}>
        <Check color={colors.harborBlue} size={13} strokeWidth={2.6} />
        <Text style={styles.statusPillDoneLabel}>Erledigt</Text>
      </View>
    );
  }
  if (!when) {
    return (
      <View style={styles.statusPill}>
        <Text style={styles.statusPillLabel}>Ohne Termin</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusPill, overdue && styles.statusPillLate]}>
      <Text
        style={[styles.statusPillLabel, overdue && styles.statusPillLateLabel]}
      >
        {when}
      </Text>
    </View>
  );
}

/**
 * A multi-day appointment says both ends; a single day says one. The
 * start is the occurrence on screen, not the series start — otherwise a
 * weekly event opened on the 15th would claim to be on the 1st.
 */
function formatEventDateRange(
  entry: Extract<PlanEntry, { kind: "event" }>,
): string {
  const start = entry.occurrenceStart;
  const spanDays = Math.max(0, isoDayDelta(entry.event.starts_on, entry.event.ends_on));
  if (spanDays === 0) return formatGermanDate(start);
  return `${formatGermanDate(start)} bis ${formatGermanDate(shiftIsoDay(start, spanDays))}`;
}

/** Whole days between two ISO calendar dates, anchored at local noon. */
function isoDayDelta(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Number.isNaN(a) || Number.isNaN(b)
    ? 0
    : Math.round((b - a) / 86_400_000);
}

function shiftIsoDay(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

interface FactDescriptor {
  icon: typeof CalendarDays;
  label: string;
  trailing?: React.ReactNode;
  value: string;
}

/**
 * The facts worth stating, in one order for both kinds: when, how long,
 * where, how often, who, and what was noted. Anything a row does not
 * carry is simply left out instead of printed as an empty line.
 */
function buildFacts(
  entry: PlanEntry,
  members: FamilyMemberOption[],
): FactDescriptor[] {
  const facts: FactDescriptor[] = [
    {
      icon: CalendarDays,
      label: "Wann",
      value:
        entry.kind === "event"
          ? formatEventDateRange(entry)
          : entry.task.due_date
            ? formatGermanDate(entry.task.due_date)
            : "Noch kein Termin",
    },
  ];

  if (entry.kind === "event") {
    facts.push({
      icon: Clock3,
      label: "Uhrzeit",
      value: formatEventWhen(entry.event),
    });
    if (entry.event.location) {
      facts.push({ icon: MapPin, label: "Ort", value: entry.event.location });
    }
    if (entry.event.recurrence !== "none") {
      facts.push({
        icon: Repeat,
        label: "Wiederholung",
        value: RECURRENCE_LABELS[entry.event.recurrence],
      });
    }
  }

  const ids = planEntryMemberIds(entry);
  const faces = members
    .filter((member) => ids.includes(member.id))
    .map(memberToPerson);
  facts.push({
    icon: Users,
    label: "Wer",
    trailing:
      faces.length > 0 ? <AvatarStack people={faces} size={26} /> : undefined,
    value: formatPlanEntryPeople(entry, members) ?? "Noch niemand zugeteilt",
  });

  const note = entry.kind === "task" ? entry.task.description : entry.event.note;
  if (note?.trim()) {
    facts.push({ icon: Pencil, label: "Notiz", value: note.trim() });
  }

  return facts;
}

/** The document a deadline or appointment was read out of, one tap away. */
function DocumentFact({
  entry,
  onAction,
}: {
  entry: PlanEntry;
  onAction: (action: PlanDetailAction) => void;
}) {
  const documentId =
    entry.kind === "task" ? entry.task.document_id : entry.event.document_id;
  if (!documentId) return null;
  return (
    <Pressable
      accessibilityHint="Öffnet das Dokument"
      accessibilityLabel="Dokument öffnen, aus dem das stammt"
      accessibilityRole="button"
      onPress={() => onAction({ type: "open-document", documentId })}
      style={({ pressed }) => [styles.factRow, pressed && styles.factRowPressed]}
    >
      <View style={styles.factIcon}>
        <FileText color={colors.harborBlue} size={17} strokeWidth={1.9} />
      </View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>Herkunft</Text>
        <Text style={styles.factValue}>Aus einem Dokument</Text>
      </View>
      <ChevronRight color={colors.mistDark} size={18} strokeWidth={1.9} />
    </Pressable>
  );
}

function FactRow({
  first = false,
  icon: Icon,
  label,
  trailing,
  value,
}: {
  first?: boolean;
  icon: typeof CalendarDays;
  label: string;
  trailing?: React.ReactNode;
  value: string;
}) {
  return (
    <View style={[styles.factRow, first && styles.factRowFirst]}>
      <View style={styles.factIcon}>
        <Icon color={colors.harborBlue} size={17} strokeWidth={1.9} />
      </View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
      {trailing}
    </View>
  );
}

/** One of the three small task actions — icon over label, equal thirds. */
function QuietAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof CalendarDays;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quietAction,
        pressed && styles.quietActionPressed,
      ]}
    >
      <Icon color={colors.harborBlue} size={19} strokeWidth={1.9} />
      <Text style={styles.quietActionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Yields to the footer instead of pushing it off a long note, the same
  // rhythm the shared form body uses.
  bodyScroll: { flexShrink: 1 },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  hero: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm + 4,
  },
  heroTile: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderColor: colors.harborLine,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  heroTileEvent: {
    backgroundColor: colors.washBlue,
  },
  heroTileDone: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  heroCopy: { alignItems: "flex-start", flex: 1, gap: 6, minWidth: 0 },
  heroTitle: { color: colors.graphite, ...typography.heading },
  heroTitleDone: {
    color: colors.mistDark,
    textDecorationLine: "line-through",
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillLabel: { color: colors.mistDark, ...typography.label },
  statusPillLate: { backgroundColor: colors.washApricot },
  statusPillLateLabel: { color: colors.warmApricot },
  statusPillDone: { backgroundColor: colors.washSage },
  statusPillDoneLabel: { color: colors.harborBlue, ...typography.label },
  facts: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  factRow: {
    alignItems: "center",
    borderTopColor: colors.sandLight,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm + 2,
    minHeight: 56,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 10,
  },
  factRowFirst: { borderTopWidth: 0 },
  factRowPressed: { backgroundColor: colors.sandLight },
  factIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  factCopy: { flex: 1, gap: 1, minWidth: 0 },
  factLabel: { color: colors.mistDark, ...typography.label },
  factValue: { color: colors.graphite, ...typography.body },
  footer: {
    borderTopColor: colors.sandLight,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  footerRow: { flexDirection: "row", gap: spacing.sm },
  quietAction: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 60,
  },
  quietActionPressed: { backgroundColor: colors.sandWarm },
  quietActionLabel: { color: colors.harborBlue, ...typography.label },
});
