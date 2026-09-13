import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PersonAvatar } from "@/src/components/person";
import {
  DetailTopBar,
  EmptyState,
  ListSkeleton,
  OrdiloButton,
  Screen,
} from "@/src/components/ui";
import { getDocumentKind } from "@/src/lib/document-kind";
import { useFamily } from "@/src/lib/family-context";
import {
  formatDueLabel,
  getEventOccurrences,
  loadHeuteData,
  mergeJournalDocuments,
  toLocalDateStr,
  type HeuteData,
  type HeuteDocument,
  type HeuteEventOccurrence,
  type HeuteTask,
} from "@/src/lib/heute";
import {
  listMembers,
  type MemberRow,
} from "@/src/lib/onboarding-actions";
import { memberToPerson } from "@/src/lib/people";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * One family member as a real stack destination. It gathers the things
 * Ordilo has already linked to this person, instead of asking the family
 * to maintain another profile by hand.
 */
export default function FamilyMemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { family } = useFamily();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [member, setMember] = useState<MemberRow | null>(null);
  const [data, setData] = useState<HeuteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      if (!family || !id) {
        setError("Diese Person wurde nicht gefunden.");
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [membersResult, homeData] = await Promise.all([
          listMembers(family.id),
          loadHeuteData(family.id),
        ]);
        if (!membersResult.success) throw new Error(membersResult.error);
        const found = membersResult.data.find(
          (candidate) => candidate.id === id,
        );
        if (!found) throw new Error("Diese Person wurde nicht gefunden.");
        setMember(found);
        setData(homeData);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Die Person kann gerade nicht geladen werden.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [family, id],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const referenceDate = useMemo(() => new Date(), []);
  const tasks = useMemo(
    () =>
      (data?.tasks ?? [])
        .filter(
          (task) =>
            task.assignedTo === id &&
            task.status === "open" &&
            task.confirmed,
        )
        .sort((a, b) =>
          (a.dueDate ?? "9999-12-31").localeCompare(
            b.dueDate ?? "9999-12-31",
          ),
        ),
    [data?.tasks, id],
  );
  const documents = useMemo(
    () =>
      mergeJournalDocuments(
        data?.analyzedDocuments ?? [],
        data?.recentDocuments ?? [],
      )
        .filter((document) =>
          document.people.some((person) => person.id === id),
        )
        .slice(0, 4),
    [data?.analyzedDocuments, data?.recentDocuments, id],
  );
  const events = useMemo(
    () =>
      getEventOccurrences(
        (data?.events ?? []).filter(
          (event) =>
            event.responsibleMemberId === id ||
            event.attendeeIds.includes(id ?? ""),
        ),
        referenceDate,
      )
        .filter((event) => event.date >= toLocalDateStr(referenceDate))
        .slice(0, 2),
    [data?.events, id, referenceDate],
  );

  const priority = tasks[0] ?? null;

  return (
    <Screen style={styles.screen}>
      <DetailTopBar
        onBack={() => router.back()}
        title="Familie"
        trailing={
          member ? (
            <Pressable
              accessibilityLabel={`${member.name} bearbeiten`}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() =>
                router.replace({
                  pathname: "/familie",
                  params: { edit: member.id },
                })
              }
              style={({ pressed }) => [
                styles.topAction,
                pressed && styles.pressed,
              ]}
            >
              <Pencil color={colors.harborBlue} size={21} strokeWidth={1.8} />
            </Pressable>
          ) : null
        }
      />

      {loading && !member ? (
        <View style={styles.loading}>
          <ListSkeleton rows={4} />
        </View>
      ) : !member ? (
        <EmptyState
          description={error ?? "Diese Person kann gerade nicht geöffnet werden."}
          heading="Person nicht erreichbar"
          icon={FileText}
        >
          <OrdiloButton
            onPress={() => void load()}
            size="lg"
            title="Erneut versuchen"
          />
        </EmptyState>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
          ]}
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
          <View style={styles.identity}>
            <PersonAvatar person={memberToPerson(member)} size={104} />
            <View style={styles.identityCopy}>
              <Text numberOfLines={2} style={styles.name}>
                {member.name}
              </Text>
              <Text style={styles.identitySubtitle}>
                Alles für {member.name}
              </Text>
            </View>
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={styles.inlineError}>
              {error}
            </Text>
          ) : null}

          <PriorityCard
            memberName={member.name}
            onOpenDocument={(documentId) =>
              router.push(`/document/${documentId}`)
            }
            onOpenPlan={() => router.push("/(tabs)/plan")}
            task={priority}
            referenceDate={referenceDate}
          />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Griffbereit</Text>
            {documents.length > 0 ? (
              <View style={styles.documentGrid}>
                {documents.map((document) => (
                  <MemberDocumentCard
                    document={document}
                    key={document.id}
                    onPress={() => router.push(`/document/${document.id}`)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>
                Noch keine Unterlage ist {member.name} zugeordnet.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Als Nächstes</Text>
            {events.length > 0 ? (
              <View style={styles.nextList}>
                {events.map((event, index) => (
                  <MemberEventRow
                    event={event}
                    key={`${event.id}-${event.date}`}
                    onPress={() => router.push("/(tabs)/plan")}
                    showDivider={index > 0}
                  />
                ))}
              </View>
            ) : tasks.length > (priority ? 1 : 0) ? (
              <MemberTaskRow
                onPress={() => router.push("/(tabs)/plan")}
                task={tasks[priority ? 1 : 0]!}
              />
            ) : (
              <Text style={styles.emptyText}>
                Für {member.name} steht gerade nichts Weiteres an.
              </Text>
            )}
          </View>

          <View style={styles.memberActions}>
            <OrdiloButton
              icon={<Check color={colors.harborBlue} size={18} strokeWidth={2} />}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/plan",
                  params: { create: "task", person: member.id },
                })
              }
              size="lg"
              title={`Aufgabe für ${member.name}`}
              variant="outline"
            />
            <OrdiloButton
              icon={<CalendarDays color={colors.harborBlue} size={18} strokeWidth={2} />}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/plan",
                  params: { create: "event", person: member.id },
                })
              }
              size="lg"
              title={`Termin für ${member.name}`}
              variant="outline"
            />
            <OrdiloButton
              icon={<Plus color={colors.harborBlue} size={18} strokeWidth={2} />}
              onPress={() =>
                router.push({
                  pathname: "/scan",
                  params: { person: member.id },
                })
              }
              size="lg"
              title={`Für ${member.name} hinzufügen`}
              variant="outline"
            />
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function PriorityCard({
  memberName,
  onOpenDocument,
  onOpenPlan,
  referenceDate,
  task,
}: {
  memberName: string;
  onOpenDocument: (documentId: string) => void;
  onOpenPlan: () => void;
  referenceDate: Date;
  task: HeuteTask | null;
}) {
  if (!task) {
    return (
      <View style={[styles.priorityCard, styles.priorityCalm]}>
        <Text style={styles.priorityTitle}>Für {memberName} ist alles ruhig.</Text>
        <Text style={styles.priorityText}>
          Gerade braucht nichts deine Aufmerksamkeit.
        </Text>
      </View>
    );
  }

  const due = formatDueLabel(task.dueDate, referenceDate);
  return (
    <View style={styles.priorityCard}>
      <View style={styles.dueLine}>
        <View style={styles.dueDot} />
        <Text style={styles.dueText}>{due?.text ?? "Ohne Frist"}</Text>
      </View>
      <Text numberOfLines={3} style={styles.priorityTitle}>
        {task.title}
      </Text>
      {task.description ? (
        <Text numberOfLines={2} style={styles.priorityText}>
          {task.description}
        </Text>
      ) : null}
      {task.documentTitle ? (
        <View style={styles.prioritySource}>
          <FileText color={colors.mistDark} size={17} strokeWidth={1.8} />
          <Text numberOfLines={1} style={styles.prioritySourceText}>
            {task.documentTitle}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityLabel={
          task.documentId ? "Zugehörigen Brief ansehen" : "Im Plan öffnen"
        }
        accessibilityRole="button"
        onPress={() =>
          task.documentId ? onOpenDocument(task.documentId) : onOpenPlan()
        }
        style={({ pressed }) => [
          styles.priorityLink,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.priorityLinkText}>
          {task.documentId ? "Brief ansehen" : "Im Plan öffnen"}
        </Text>
        <ChevronRight color={colors.harborBlue} size={17} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function MemberDocumentCard({
  document,
  onPress,
}: {
  document: HeuteDocument;
  onPress: () => void;
}) {
  const kind = getDocumentKind(document.documentType);
  const KindIcon = kind.icon;
  const month = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(
    new Date(document.createdAt),
  );
  return (
    <Pressable
      accessibilityLabel={document.title ?? document.originalFilename ?? "Dokument"}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.documentCard,
        pressed && styles.documentCardPressed,
      ]}
    >
      <View style={[styles.documentPreview, { backgroundColor: kind.tint }]}>
        <KindIcon color={kind.ink} size={34} strokeWidth={1.5} />
      </View>
      <Text numberOfLines={2} style={styles.documentTitle}>
        {document.title ?? document.originalFilename ?? kind.label}
      </Text>
      <Text numberOfLines={1} style={styles.documentMeta}>
        {month}
      </Text>
    </Pressable>
  );
}

function MemberEventRow({
  event,
  onPress,
  showDivider,
}: {
  event: HeuteEventOccurrence;
  onPress: () => void;
  showDivider: boolean;
}) {
  const day = new Date(`${event.date}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
  })
    .format(day)
    .replace(".", "")
    .toUpperCase();
  return (
    <Pressable
      accessibilityLabel={event.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.nextRow,
        showDivider && styles.rowDivider,
        pressed && styles.nextRowPressed,
      ]}
    >
      <View style={styles.dateTile}>
        <Text style={styles.dateWeekday}>{weekday}</Text>
        <Text style={styles.dateDay}>{day.getDate()}</Text>
      </View>
      <View style={styles.nextCopy}>
        <Text numberOfLines={1} style={styles.nextTitle}>
          {event.title}
        </Text>
        <Text numberOfLines={1} style={styles.nextMeta}>
          {[
            event.startsTime ? `${event.startsTime.slice(0, 5)} Uhr` : "Ganztägig",
            event.location,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <ChevronRight color={colors.mistDark} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

function MemberTaskRow({
  onPress,
  task,
}: {
  onPress: () => void;
  task: HeuteTask;
}) {
  return (
    <Pressable
      accessibilityLabel={task.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.nextRow,
        styles.singleNextRow,
        pressed && styles.nextRowPressed,
      ]}
    >
      <View style={styles.dateTile}>
        <CalendarDays color={colors.harborBlue} size={22} strokeWidth={1.7} />
      </View>
      <View style={styles.nextCopy}>
        <Text numberOfLines={2} style={styles.nextTitle}>
          {task.title}
        </Text>
      </View>
      <ChevronRight color={colors.mistDark} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  loading: { padding: spacing.md },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  topAction: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: "auto",
    width: 44,
  },
  pressed: { opacity: 0.72 },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  identityCopy: { flex: 1, gap: 2, minWidth: 0 },
  name: {
    color: colors.graphite,
    ...typography.largeTitle,
    fontSize: 34,
    lineHeight: 40,
  },
  identitySubtitle: { color: colors.mistDark, ...typography.timestamp },
  inlineError: {
    backgroundColor: colors.destructiveBackground,
    borderRadius: radii.sm,
    color: colors.destructive,
    padding: spacing.sm,
    ...typography.timestamp,
  },
  priorityCard: {
    backgroundColor: colors.washSageSoft,
    borderCurve: "continuous",
    borderRadius: radii.sm,
    gap: spacing.xs,
    padding: spacing.md,
  },
  priorityCalm: { paddingVertical: spacing.lg },
  dueLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  dueDot: {
    backgroundColor: colors.warmApricot,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  dueText: { color: colors.warmApricot, ...typography.caption },
  priorityTitle: { color: colors.graphite, ...typography.display },
  priorityText: { color: colors.mistDark, ...typography.timestamp },
  prioritySource: {
    alignItems: "center",
    backgroundColor: "rgba(253,252,250,0.72)",
    borderRadius: radii.base,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  prioritySourceText: {
    color: colors.graphite,
    flex: 1,
    ...typography.timestamp,
  },
  priorityLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    minHeight: 36,
  },
  priorityLinkText: { color: colors.harborBlue, ...typography.caption },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.graphite, ...typography.display },
  emptyText: { color: colors.mistDark, ...typography.timestamp },
  memberActions: { gap: spacing.sm },
  documentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  documentCard: {
    minWidth: 0,
    width: "48%",
  },
  documentCardPressed: { opacity: 0.76 },
  documentPreview: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.sm,
    height: 92,
    justifyContent: "center",
    marginBottom: 6,
  },
  documentTitle: { color: colors.graphite, ...typography.caption },
  documentMeta: { color: colors.mistDark, ...typography.label },
  nextList: {
    borderBottomColor: colors.mistLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  singleNextRow: {
    borderBottomColor: colors.mistLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowDivider: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextRowPressed: { backgroundColor: colors.sand },
  dateTile: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: radii.base,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  dateWeekday: { color: colors.mistDark, ...typography.label },
  dateDay: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 20,
    lineHeight: 22,
  },
  nextCopy: { flex: 1, gap: 2, minWidth: 0 },
  nextTitle: { color: colors.graphite, ...typography.title },
  nextMeta: { color: colors.mistDark, ...typography.timestamp },
});
