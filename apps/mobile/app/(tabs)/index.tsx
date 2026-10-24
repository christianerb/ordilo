import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  ListChecks,
  MapPin,
  Plus,
  ScanLine,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { FirstValueExample } from "@/src/components/first-value-example";
import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { NotificationPrimer } from "@/src/components/notification-primer";
import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import { MOBILE_DOCK_CONTENT_INSET } from "@/src/components/ordilo-tab-bar";
import { AvatarStack, PersonAvatar } from "@/src/components/person";
import { TaskCheck } from "@/src/components/task-check";
import {
  Card,
  EmptyState,
  IconTile,
  InlineNotice,
  ListGroup,
  ListRow,
  ListSkeleton,
  OrdiloButton,
  Screen,
  SectionHeader,
  Skeleton,
} from "@/src/components/ui";
import {
  activityDestination,
  activityDetailLabel,
  formatActivityWhen,
  loadFamilyActivity,
  type ActivityDestination,
  type FamilyActivityItem,
  type FamilyActivityKind,
} from "@/src/lib/activity";
import { getDocumentKind } from "@/src/lib/document-kind";
import { fail, success } from "@/src/lib/feedback";
import { useFamily } from "@/src/lib/family-context";
import {
  acceptInboundSuggestion,
  decideInboundEmailRetention,
  dismissInboundSuggestion,
  findMember,
  formatDaySummary,
  formatDueLabel,
  formatInboundSender,
  formatInboundWhen,
  getDatedOpenTasks,
  getDiscoveryInsight,
  getEventOccurrences,
  getHeuteBriefing,
  getHomeGreeting,
  getOpenTasksWithoutDueDate,
  getTodayEvents,
  getTodayTasks,
  getUpcomingAgenda,
  HOME_EVENTS_HORIZON_DAYS,
  loadHeuteData,
  mergeJournalDocuments,
  setHeuteTaskStatus,
  toLocalDateStr,
  type HeuteAgendaEntry,
  type HeuteBriefing,
  type HeuteData,
  type HeuteDocument,
  type HeuteEventOccurrence,
  type HeuteInboundDiscovery,
  type HeuteInboundSuggestion,
  type HeuteMember,
  type HeutePerson,
  type HeuteTask,
} from "@/src/lib/heute";
import { memberToPerson } from "@/src/lib/people";
import {
  enablePushNotifications,
  getPushPermission,
  hasNotificationPrimerBeenShown,
  markNotificationPrimerShown,
  shouldShowNotificationPrimer,
} from "@/src/lib/notifications";
import { useSession } from "@/src/lib/session";
import { contentEntering } from "@/src/theme/motion";
import { colors, radii, sizes, spacing, typography } from "@/src/theme/tokens";

/**
 * Start — the family's briefing. Opened for ten seconds in a hallway, it
 * has to answer one question first: what matters right now? One briefing
 * card takes that answer (overdue, today, something new to look at, or
 * honestly "alles gut"); then today, the coming days, what arrived, and
 * what is next. Documents, tasks and appointments are not modules here —
 * they are the same life, shown together and always with the people they
 * belong to. Reads are the same RLS queries as the web Home page.
 */
export default function HeuteScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { session } = useSession();
  const [data, setData] = useState<HeuteData | null>(null);
  const [tasks, setTasks] = useState<HeuteTask[]>([]);
  const [discoveries, setDiscoveries] = useState<HeuteInboundDiscovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedTask, setCompletedTask] = useState<HeuteTask | null>(null);
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);
  const [mutatingSuggestionId, setMutatingSuggestionId] = useState<
    string | null
  >(null);
  const [mutatingRetentionId, setMutatingRetentionId] = useState<
    string | null
  >(null);
  const [clock, setClock] = useState(() => Date.now());
  const [activityItems, setActivityItems] = useState<FamilyActivityItem[]>([]);
  const [primerVisible, setPrimerVisible] = useState(false);
  const [primerBusy, setPrimerBusy] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!family) {
        setActivityItems([]);
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        // Neuigkeiten ride along with every briefing refresh (focus,
        // pull-to-refresh, midnight/foreground) instead of a separate
        // effect, so the feed can never go stale within a session. The
        // feed fails silently — it appears when ready and never blocks
        // or breaks the briefing.
        const [result, activity] = await Promise.all([
          loadHeuteData(family.id),
          loadFamilyActivity(family.id).catch(
            () => [] as FamilyActivityItem[],
          ),
        ]);
        setData(result);
        setTasks(result.tasks);
        setDiscoveries(result.inboundDiscoveries);
        setActivityItems(activity);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Das hat gerade nicht geklappt. Bitte versuch es nochmal.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [family],
  );

  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  // The permission primer asks exactly once, at the moment the family has
  // its first read document — before that, a notification would carry no
  // news and the ask would be noise.
  useEffect(() => {
    if (!family || !data) return;
    const processedDocuments =
      data.confirmedDocumentCount + data.unconfirmedDocumentCount;
    let cancelled = false;
    void (async () => {
      const permission = await getPushPermission();
      const alreadyShown = await hasNotificationPrimerBeenShown(family.id);
      if (
        cancelled ||
        !shouldShowNotificationPrimer({
          permission,
          processedDocuments,
          alreadyShown,
        })
      ) {
        return;
      }
      // Mark before presenting so a refocus can never show it twice.
      await markNotificationPrimerShown(family.id);
      if (!cancelled) setPrimerVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [family, data]);

  // Refresh both date-derived groups and the bounded event query after
  // midnight or returning to foreground. Recalculating occurrences alone
  // cannot reveal events that newly entered the query horizon.
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshDashboard = () => {
      setClock(Date.now());
      void load(true);
    };
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).getTime();
      midnightTimer = setTimeout(() => {
        refreshDashboard();
        scheduleMidnight();
      }, nextMidnight - now.getTime() + 100);
    };
    scheduleMidnight();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshDashboard();
    });
    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, [load]);

  const referenceDate = useMemo(() => new Date(clock), [clock]);
  const dateLine = useMemo(
    () =>
      new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(referenceDate),
    [referenceDate],
  );
  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const people = useMemo(() => members.map(memberToPerson), [members]);
  const currentMember = useMemo(
    () =>
      members.find((member) => member.linkedUserId === session?.user.id) ??
      members[0] ??
      null,
    [members, session?.user.id],
  );
  const datedTasks = useMemo(() => getDatedOpenTasks(tasks), [tasks]);
  const undatedOpenTasks = useMemo(
    () => getOpenTasksWithoutDueDate(tasks),
    [tasks],
  );
  const todayTasks = useMemo(
    () => getTodayTasks(tasks, referenceDate),
    [tasks, referenceDate],
  );
  const eventOccurrences = useMemo(
    () => getEventOccurrences(data?.events ?? [], referenceDate),
    [data?.events, referenceDate],
  );
  const todayEvents = useMemo(
    () => getTodayEvents(eventOccurrences, referenceDate),
    [eventOccurrences, referenceDate],
  );
  const agenda = useMemo(
    () => getUpcomingAgenda(tasks, eventOccurrences, referenceDate),
    [tasks, eventOccurrences, referenceDate],
  );
  const journalDocuments = useMemo(
    () =>
      mergeJournalDocuments(
        data?.analyzedDocuments ?? [],
        data?.recentDocuments ?? [],
      ),
    [data?.analyzedDocuments, data?.recentDocuments],
  );
  const reviewDocuments = useMemo(
    () => data?.analyzedDocuments ?? [],
    [data?.analyzedDocuments],
  );
  const discoveryInsight = useMemo(
    () => getDiscoveryInsight(journalDocuments),
    [journalDocuments],
  );
  const upcomingCount = agenda.days.reduce(
    (sum, day) => sum + day.entries.length,
    agenda.hiddenCount,
  );
  const briefing = useMemo(
    () => getHeuteBriefing(tasks, reviewDocuments, upcomingCount, referenceDate, { todayEvents, documents: journalDocuments }),
    [tasks, reviewDocuments, upcomingCount, referenceDate, todayEvents, journalDocuments],
  );
  const daySummary = useMemo(
    () =>
      formatDaySummary({
        todayEvents: todayEvents.length,
        todayTasks: todayTasks.length,
        reviewDocuments: data?.unconfirmedDocumentCount ?? 0,
      }),
    [todayEvents.length, todayTasks.length, data?.unconfirmedDocumentCount],
  );

  const isFirstVisit =
    !datedTasks.length &&
    !undatedOpenTasks.length &&
    !todayEvents.length &&
    !journalDocuments.length &&
    !discoveries.length;
  const heroTaskId =
    briefing.kind === "task"
      ? briefing.task.id
      : briefing.kind === "calm"
        ? (briefing.nextTask?.task.id ?? null)
        : null;
  const nextTasks = useMemo(() => {
    const todayStr = toLocalDateStr(referenceDate);
    const horizonStr = toLocalDateStr(
      new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate() + 7,
      ),
    );
    return [
      // Overdue tasks that are not the briefing, everything beyond the
      // agenda horizon, and what has no date yet. Today's tasks and the
      // coming week already live in the sections above.
      ...datedTasks.filter(
        (task) =>
          task.id !== heroTaskId &&
          task.dueDate !== null &&
          (task.dueDate > horizonStr || task.dueDate < todayStr),
      ),
      ...undatedOpenTasks,
    ].slice(0, 3);
  }, [datedTasks, heroTaskId, undatedOpenTasks, referenceDate]);

  const toggleTask = useCallback(
    async (task: HeuteTask) => {
      if (!family || mutatingTaskId) return false;
      const nextStatus = task.status === "done" ? "open" : "done";
      const previousTasks = tasks;
      setMutatingTaskId(task.id);
      setTasks((current) =>
        current.map((candidate) =>
          candidate.id === task.id
            ? { ...candidate, status: nextStatus }
            : candidate,
        ),
      );

      const result = await setHeuteTaskStatus(task.id, nextStatus, family.id);
      if (!result.success) {
        setTasks(previousTasks);
        setError(result.error);
        void fail();
      } else if (nextStatus === "done") {
        setCompletedTask(task);
        void success();
      }
      setMutatingTaskId(null);
      return result.success;
    },
    [family, mutatingTaskId, tasks],
  );

  const handleSuggestion = useCallback(
    async (suggestion: HeuteInboundSuggestion, accept: boolean) => {
      if (mutatingSuggestionId) return;
      setMutatingSuggestionId(suggestion.id);
      const result = accept
        ? await acceptInboundSuggestion(suggestion.id)
        : await dismissInboundSuggestion(suggestion.id);
      if (!result.success) {
        setError(result.error);
        void fail();
        setMutatingSuggestionId(null);
        return;
      }
      setDiscoveries((current) =>
        current.map((discovery) => ({
          ...discovery,
          suggestions: discovery.suggestions.filter(
            (candidate) => candidate.id !== suggestion.id,
          ),
        })),
      );
      await load(true);
      if (accept) {
        void success();
      }
      setMutatingSuggestionId(null);
    },
    [load, mutatingSuggestionId],
  );

  const handleRetention = useCallback(
    async (discovery: HeuteInboundDiscovery, keep: boolean) => {
      if (mutatingRetentionId) return;
      setMutatingRetentionId(discovery.id);
      const result = await decideInboundEmailRetention(discovery.id, keep);
      if (!result.success) {
        setError(result.error);
        setMutatingRetentionId(null);
        return;
      }
      setDiscoveries((current) =>
        current.filter((candidate) => candidate.id !== discovery.id),
      );
      setMutatingRetentionId(null);
    },
    [mutatingRetentionId],
  );

  const openDocument = useCallback(
    (documentId: string) => router.push(`/document/${documentId}`),
    [router],
  );

  const openEventInPlan = useCallback(
    (eventId: string) =>
      router.push({ pathname: "/(tabs)/plan", params: { event: eventId } }),
    [router],
  );

  const openActivity = useCallback(
    (destination: ActivityDestination) => router.push(destination),
    [router],
  );

  const handlePrimerAllow = useCallback(async () => {
    if (primerBusy) return;
    setPrimerBusy(true);
    const result = await enablePushNotifications();
    setPrimerBusy(false);
    setPrimerVisible(false);
    if (result.state === "granted") {
      void success();
    } else if (result.state === "blocked") {
      void fail();
      Alert.alert(
        "Mitteilungen sind blockiert",
        "iOS hat die Mitteilungen für Ordilo ausgeschaltet. Du kannst sie in den iPhone-Einstellungen wieder erlauben.",
        [
          { text: "Später", style: "cancel" },
          {
            text: "Einstellungen öffnen",
            onPress: () => void Linking.openSettings(),
          },
        ],
      );
    }
  }, [primerBusy]);

  const header = (
    <HomeHeader
      dateLine={dateLine}
      greeting={getHomeGreeting(referenceDate)}
      name={currentMember?.name ?? null}
      onOpenFamily={() => router.push("/familie")}
      people={people}
      summary={loading ? null : daySummary}
    />
  );

  if (loading) {
    return (
      <Screen>
        {header}
        <View style={styles.loadingList}>
          <Skeleton height={124} radius={radii.lg} />
          <View style={styles.loadingGap} />
          <ListSkeleton rows={4} />
        </View>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        {header}
        <View style={styles.center}>
          <EmptyState
            icon={Clock3}
            heading="Start konnte nicht geladen werden"
            description={error}
          >
            <OrdiloButton
              onPress={() => void load()}
              size="lg"
              title="Erneut versuchen"
            />
          </EmptyState>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={colors.harborBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {header}

        {isFirstVisit ? (
          <FirstVisit
            onAsk={() => router.push("/posteingang")}
            onScan={() => router.push({ pathname: "/scan", params: { auto: "1" } })}
          />
        ) : (
          <BriefingCard
            briefing={briefing}
            members={members}
            onCompleteTask={toggleTask}
            onOpenDocument={openDocument}
            onOpenLibrary={() => router.push("/(tabs)/ablage")}
            onOpenPlan={() => router.push("/(tabs)/plan")}
            taskBusy={mutatingTaskId === heroTaskId}
          />
        )}

        {completedTask ? <InlineNotice message={`Erledigt: ${completedTask.title}`} actionLabel="Rückgängig" onAction={() => {
          if (mutatingTaskId) return;
          void toggleTask({ ...completedTask, status: "done" }).then((ok) => { if (ok) setCompletedTask(null); });
        }} /> : null}

        {error ? (
          <InlineNotice
            actionLabel="Schließen"
            message={error}
            onAction={() => setError(null)}
          />
        ) : null}

        {discoveries.map((discovery) => (
          <InboundDiscoveryCard
            busyRetention={mutatingRetentionId === discovery.id}
            busySuggestionId={mutatingSuggestionId}
            discovery={discovery}
            key={discovery.id}
            onRetention={handleRetention}
            onSuggestion={handleSuggestion}
          />
        ))}

        {!isFirstVisit ? (
          <>
            {todayEvents.length > 0 || todayTasks.some((task) => task.id !== heroTaskId) ? (
              <Section
                title="Heute bei euch"
              >
                <ListGroup style={styles.todayList}>
                  {todayEvents.map((event, index) => (
                    <TodayEventRow
                      event={event}
                      first={index === 0}
                      key={`${event.id}-${event.date}`}
                      members={members}
                      onOpen={openEventInPlan}
                    />
                  ))}
                  {todayTasks
                    .filter((task) => task.id !== heroTaskId)
                    .map((task, index) => (
                      <TaskListRow
                        busy={mutatingTaskId === task.id}
                        first={todayEvents.length === 0 && index === 0}
                        key={task.id}
                        members={members}
                        onToggle={() => void toggleTask(task)}
                        referenceDate={referenceDate}
                        task={task}
                      />
                    ))}
                </ListGroup>
              </Section>
            ) : null}

            {agenda.days.length > 0 ? (
              <Section
                action={
                  agenda.hiddenCount > 0
                    ? {
                        label: `Alle ${upcomingCount}`,
                        onPress: () => router.push("/(tabs)/plan"),
                      }
                    : undefined
                }
                hint="Die nächsten 7 Tage"
                title="Demnächst"
              >
                <ListGroup>
                  {agenda.days.map((day, dayIndex) => (
                    <View key={day.date}>
                      <View style={[styles.dayLabelRow, dayIndex > 0 && styles.dayLabelRowDivider]}>
                        <Text style={styles.dayLabel}>{day.label}</Text>
                      </View>
                      {day.entries.map((entry) => (
                        <AgendaRow
                          busy={mutatingTaskId === entry.task?.id}
                          entry={entry}
                          key={entry.id}
                          members={members}
                          onOpenEvent={openEventInPlan}
                          onToggleTask={toggleTask}
                        />
                      ))}
                    </View>
                  ))}
                </ListGroup>
              </Section>
            ) : null}

            {nextTasks.length > 0 ? (
              <Section
                action={{ label: "Plan", onPress: () => router.push("/(tabs)/plan") }}
                title="Als Nächstes"
              >
                <ListGroup>
                  {nextTasks.map((task, index) => (
                    <TaskListRow
                      busy={mutatingTaskId === task.id}
                      first={index === 0}
                      key={task.id}
                      members={members}
                      onToggle={() => void toggleTask(task)}
                      referenceDate={referenceDate}
                      task={task}
                    />
                  ))}
                </ListGroup>
              </Section>
            ) : null}

            {/* Deadlines come before news: a date the family could miss
                outranks a record of what already happened. */}
            {activityItems.length > 0 ? (
              <Section title="Neuigkeiten">
                <ListGroup>
                  {activityItems.slice(0, NEUIGKEITEN_ROWS).map((item, index) => (
                    <ActivityRow
                      first={index === 0}
                      item={item}
                      key={item.id}
                      onOpen={openActivity}
                    />
                  ))}
                </ListGroup>
              </Section>
            ) : null}

            {journalDocuments.length > 0 ? (
              <Section
                action={{
                  label: "Alle",
                  onPress: () => router.push("/(tabs)/ablage"),
                  accessibilityLabel: "Alle Dokumente anzeigen",
                }}
                hint={
                  data?.unconfirmedDocumentCount
                    ? data.unconfirmedDocumentCount === 1
                      ? "1 wartet auf einen Blick"
                      : `${data.unconfirmedDocumentCount} warten auf einen Blick`
                    : data?.journalDocumentCount
                      ? `${data.journalDocumentCount} im Familienbuch`
                      : undefined
                }
                title="Dokumente"
              >
                <ListGroup>
                  {journalDocuments.map((document, index) => (
                    <DocumentListRow
                      document={document}
                      first={index === 0}
                      key={document.id}
                      onPress={() => openDocument(document.id)}
                    />
                  ))}
                </ListGroup>
              </Section>
            ) : null}

            {discoveryInsight ? (
              <Pressable
                accessibilityHint="Öffnet das Dokument"
                accessibilityLabel="Ordilo hat etwas entdeckt"
                accessibilityRole="button"
                onPress={() => openDocument(discoveryInsight.documentId)}
                style={({ pressed }) => [styles.insight, pressed && styles.pressed]}
              >
                <IconTile tint={colors.warmWhite}>
                  <Sparkles color={colors.harborBlue} size={18} />
                </IconTile>
                <View style={styles.rowContent}>
                  <Text style={[typography.title, styles.rowTitle]}>
                    Ordilo hat etwas entdeckt
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[typography.timestamp, styles.rowSubtitle]}
                  >
                    {discoveryInsight.message}
                  </Text>
                </View>
                <ChevronRight color={colors.mist} size={18} />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <NotificationPrimer
        busy={primerBusy}
        onAllow={() => void handlePrimerAllow()}
        onLater={() => setPrimerVisible(false)}
        visible={primerVisible}
      />
    </Screen>
  );
}

/** Start shows the five newest — the full feed stays a server-side limit. */
const NEUIGKEITEN_ROWS = 5;

const ACTIVITY_ICONS: Record<FamilyActivityKind, LucideIcon> = {
  document: FileText,
  task: ListChecks,
  event: CalendarDays,
  email: Inbox,
  member: UserPlus,
};

/**
 * One quiet feed row: a small kind icon in mist-dark, the title on one
 * line, detail and relative time as a timestamp. Rows without a place to
 * go (no ref) stay read-only.
 */
function ActivityRow({
  first,
  item,
  onOpen,
}: {
  first: boolean;
  item: FamilyActivityItem;
  onOpen: (destination: ActivityDestination) => void;
}) {
  const Icon = ACTIVITY_ICONS[item.kind];
  const destination = activityDestination(item);
  const subtitle = [activityDetailLabel(item), formatActivityWhen(item.occurredAt)]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      accessibilityHint={destination ? "Öffnet den Eintrag" : undefined}
      first={first}
      leading={
        <IconTile size={32} tint={colors.sandLight}>
          <Icon color={colors.mistDark} size={16} strokeWidth={1.8} />
        </IconTile>
      }
      onPress={destination ? () => onOpen(destination) : undefined}
      subtitle={subtitle || null}
      title={item.title}
    />
  );
}

function HomeHeader({
  dateLine,
  greeting,
  name,
  onOpenFamily,
  people,
  summary,
}: {
  dateLine: string;
  greeting: string;
  name: string | null;
  onOpenFamily: () => void;
  people: ReturnType<typeof memberToPerson>[];
  summary: string | null;
}) {
  return (
    <View style={styles.homeHeader}>
      <View style={styles.brandRow}>
        <View style={styles.wordmark}>
          <OrdiloMark size={34} />
          <View>
            <Text style={styles.brandName}>Ordilo</Text>
            <Text style={styles.brandPromise}>Für das, was euch trägt.</Text>
          </View>
        </View>
        <View style={styles.familySummary}>
          <Text numberOfLines={1} style={styles.dateLine}>
            {dateLine}
          </Text>
          <Pressable
            accessibilityHint="Öffnet Familie und Einstellungen"
            accessibilityLabel="Familie"
            accessibilityRole="button"
            hitSlop={6}
            onPress={onOpenFamily}
            style={({ pressed }) => [
              styles.familyButton,
              pressed && styles.pressed,
            ]}
          >
            {people.length > 0 ? (
              <AvatarStack max={3} people={people} size={32} />
            ) : (
              <View style={styles.familyPlaceholder} />
            )}
            <View style={styles.addFamilyMember}>
              <Plus color={colors.mistDark} size={16} strokeWidth={1.8} />
            </View>
          </Pressable>
        </View>
      </View>
      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>
          {name ? `${greeting},\n${name}.` : `${greeting}.`}
        </Text>
        {summary ? <Text style={styles.daySummary}>{summary}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The one card that answers "was ist jetzt wichtig?". Three moods, one
 * shape: a task (with its checkbox right there), documents waiting for a
 * look (one tap to the first), or the calm state — which is an answer,
 * not an absence.
 */
function BriefingCard({
  briefing,
  members,
  onCompleteTask,
  onOpenDocument,
  onOpenLibrary,
  onOpenPlan,
  taskBusy,
}: {
  briefing: HeuteBriefing;
  members: HeuteMember[];
  onCompleteTask: (task: HeuteTask) => Promise<boolean>;
  onOpenDocument: (documentId: string) => void;
  onOpenLibrary: () => void;
  onOpenPlan: () => void;
  taskBusy: boolean;
}) {
  if (briefing.kind === "event") {
    const people = peopleForOccurrence(briefing.occurrence, members);
    const time = briefing.occurrence.startsTime?.slice(0, 5);
    return (
      <DayBriefLead message="Ein Termin gehört heute dir.">
        <Text style={styles.priorityLabel}>Heute bei euch</Text>
        <Text style={styles.priorityTitle}>{briefing.occurrence.title}</Text>
        <Text style={styles.priorityText}>
          {[time ? `${time} Uhr` : "Ganztägig", briefing.occurrence.location]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {people.length > 0 ? (
          <AvatarStack people={people} size={28} style={styles.priorityPeople} />
        ) : null}
        <OrdiloButton onPress={onOpenPlan} title="Im Plan öffnen" />
      </DayBriefLead>
    );
  }
  if (briefing.kind === "processing") {
    return (
      <DayBriefLead message="Ordilo kümmert sich gerade darum.">
        <Text style={styles.priorityTitle}>
          {briefing.document.status === "failed"
            ? "Ein Dokument braucht deine Hilfe"
            : "Ein Dokument wird noch gelesen"}
        </Text>
        <Text style={styles.priorityText}>
          Noch sind nicht alle Informationen geprüft.
        </Text>
        <OrdiloButton
          title="Dokument ansehen"
          onPress={() => onOpenDocument(briefing.document.id)}
        />
      </DayBriefLead>
    );
  }
  if (briefing.kind === "task") {
    const { task, due } = briefing;
    const assignee = findMember(members, task.assignedTo);
    const label = due.overdue
      ? "Überfällig"
      : due.text === "Heute"
        ? "Heute dran"
        : "Morgen dran";
    return (
      <DayBriefLead message="Eine Sache braucht heute deinen Blick.">
        <Text
          style={[
            styles.priorityLabel,
            due.overdue && styles.priorityLabelOverdue,
          ]}
        >
          {label}
        </Text>
        <Text numberOfLines={3} style={styles.priorityTitle}>
          {task.title}
        </Text>
        {task.description ? (
          <Text numberOfLines={2} style={styles.priorityText}>
            {task.description}
          </Text>
        ) : null}
        <View style={styles.priorityMeta}>
          {assignee ? (
            <View style={styles.briefingPerson}>
              <PersonAvatar person={assignee} size={sizes.avatarSmall} />
              <Text style={styles.briefingMetaText}>{assignee.name}</Text>
            </View>
          ) : null}
          <View style={styles.sourceChip}>
            <FileText color={colors.mistDark} size={15} strokeWidth={1.8} />
            <Text numberOfLines={1} style={styles.sourceChipText}>
              {task.documentTitle ?? due.text}
            </Text>
          </View>
        </View>
        <View style={styles.priorityActions}>
          <OrdiloButton
            onPress={() =>
              task.documentId ? onOpenDocument(task.documentId) : onOpenPlan()
            }
            title={task.documentId ? "Brief öffnen" : "Im Plan öffnen"}
          />
          <Pressable
            accessibilityLabel={`${task.title} als erledigt markieren`}
            accessibilityRole="button"
            disabled={taskBusy}
            onPress={() => void onCompleteTask(task)}
            style={({ pressed }) => [
              styles.doneAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.doneActionText}>
              {taskBusy ? "Einen Moment …" : "Schon erledigt"}
            </Text>
          </Pressable>
        </View>
      </DayBriefLead>
    );
  }

  if (briefing.kind === "review") {
    const kind = getDocumentKind(briefing.document.documentType);
    const KindIcon = kind.icon;
    return (
      <DayBriefLead message="Etwas Neues braucht deinen Blick.">
        <Text style={styles.priorityLabel}>Neu für euch</Text>
        <Text style={styles.priorityTitle}>
          {briefing.count === 1
            ? "Ordilo hat ein Dokument gelesen"
            : `Ordilo hat ${briefing.count} Dokumente gelesen`}
        </Text>
        <Text style={styles.priorityText}>
          {briefing.count === 1
            ? "Ein kurzer Blick genügt, dann ist es abgelegt."
            : "Ein kurzer Blick pro Dokument genügt, dann sind sie abgelegt."}
        </Text>
        <Pressable
          accessibilityHint="Öffnet das Dokument zum Prüfen"
          accessibilityLabel={`${briefing.document.title ?? "Dokument"} prüfen`}
          accessibilityRole="button"
          onPress={() => onOpenDocument(briefing.document.id)}
          style={({ pressed }) => [styles.briefingDocument, pressed && styles.pressed]}
        >
          <IconTile tint={kind.tint}>
            <KindIcon color={kind.ink} size={20} strokeWidth={1.9} />
          </IconTile>
          <View style={styles.rowContent}>
            <Text numberOfLines={1} style={[typography.title, styles.rowTitle]}>
              {briefing.document.title ?? briefing.document.originalFilename ?? "Dokument"}
            </Text>
            <Text numberOfLines={1} style={[typography.timestamp, styles.rowSubtitle]}>
              {briefing.document.summary ?? kind.label}
            </Text>
          </View>
          <View style={styles.briefingGo}>
            <Text style={styles.briefingGoText}>Prüfen</Text>
            <ChevronRight color={colors.harborBlue} size={16} strokeWidth={2.2} />
          </View>
        </Pressable>
        {briefing.count > 1 ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onOpenLibrary}
            style={({ pressed }) => [styles.briefingLink, pressed && styles.pressed]}
          >
            <Text style={styles.briefingLinkText}>Alle neuen Dokumente ansehen</Text>
          </Pressable>
        ) : null}
      </DayBriefLead>
    );
  }

  const { nextTask } = briefing;
  return (
    <DayBriefLead message="Heute ist alles in guten Händen.">
      <Text style={styles.priorityLabel}>Ein ruhiger Moment</Text>
      <Text style={styles.priorityTitle}>Keine offenen Fristen für heute.</Text>
      <Text style={styles.priorityText}>
        {briefing.upcomingCount === 0
          ? `In den nächsten ${HOME_EVENTS_HORIZON_DAYS} Tagen steht nichts an.`
          : briefing.upcomingCount === 1
            ? `Eine Sache steht in den nächsten ${HOME_EVENTS_HORIZON_DAYS} Tagen an.`
            : `${briefing.upcomingCount} Dinge stehen in den nächsten ${HOME_EVENTS_HORIZON_DAYS} Tagen an.`}
      </Text>
      {nextTask ? (
        <Pressable
          accessibilityHint="Öffnet den Plan"
          accessibilityLabel={`Als Nächstes: ${nextTask.task.title}, ${nextTask.dateLabel}`}
          accessibilityRole="button"
          onPress={onOpenPlan}
          style={({ pressed }) => [styles.calmNext, pressed && styles.pressed]}
        >
          <CalendarDays color={colors.harborBlue} size={16} strokeWidth={1.9} />
          <Text numberOfLines={2} style={styles.calmNextText}>
            <Text style={styles.calmNextLead}>Als Nächstes: </Text>
            {nextTask.task.title} · {nextTask.dateLabel}
          </Text>
        </Pressable>
      ) : null}
    </DayBriefLead>
  );
}

function DayBriefLead({
  children,
  message,
}: {
  children: ReactNode;
  message: string;
}) {
  return (
    <Animated.View entering={contentEntering()} style={styles.dayBrief}>
      <View style={styles.dayBriefIntro}>
        <View style={styles.dayBriefCharacter}>
          <OrdiloCharacter animated={false} size={108} />
        </View>
        <Text style={styles.dayBriefMessage}>{message}</Text>
      </View>
      <View style={styles.priorityPanel}>{children}</View>
    </Animated.View>
  );
}

function FirstVisit({ onAsk, onScan }: { onAsk: () => void; onScan: () => void }) {
  return (
    <View style={styles.firstVisit}>
      <OrdiloCharacter animated size={96} />
      <Text style={styles.firstVisitTitle}>Schön, dass ihr da seid</Text>
      <Text style={styles.firstVisitText}>
        Gib Ordilo den ersten Brief. Ordilo liest ihn, merkt sich Termine und
        Fristen und legt ihn für die ganze Familie ab.
      </Text>
      <OrdiloButton
        icon={<ScanLine color={colors.warmWhite} size={18} />}
        onPress={onScan}
        size="lg"
        title="Ersten Brief scannen"
      />
      <FirstValueExample onContinue={onScan} />
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={onAsk}
        style={({ pressed }) => [styles.firstVisitLink, pressed && styles.pressed]}
      >
        <Text style={styles.firstVisitLinkText}>Oder eine E-Mail weiterleiten</Text>
      </Pressable>
    </View>
  );
}

function Section({
  action,
  children,
  hint,
  title,
}: {
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  children: ReactNode;
  hint?: string;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader action={action} hint={hint} title={title} />
      {children}
    </View>
  );
}

function peopleForOccurrence(
  occurrence: HeuteEventOccurrence,
  members: HeuteMember[],
): HeutePerson[] {
  return occurrence.attendeeIds
    .map((id) => findMember(members, id))
    .filter((person): person is HeutePerson => person !== null);
}

function TodayEventRow({
  event,
  first,
  members,
  onOpen,
}: {
  event: HeuteEventOccurrence;
  first: boolean;
  members: HeuteMember[];
  onOpen: (eventId: string) => void;
}) {
  const people = peopleForOccurrence(event, members);
  const time = event.startsTime ? event.startsTime.slice(0, 5) : null;
  return (
    <ListRow
      accessibilityHint="Öffnet den Termin im Plan"
      first={first}
      onPress={() => onOpen(event.id)}
      leading={
        <View style={styles.timeColumn}>
          <Text style={[styles.timeText, !time && styles.timeTextAllDay]}>
            {time ?? "Ganz-\ntags"}
          </Text>
        </View>
      }
      subtitle={event.location ?? (people.length === 0 ? "Termin" : null)}
      title={event.title}
      titleLines={2}
      trailing={people.length > 0 ? <AvatarStack people={people} size={28} /> : undefined}
    />
  );
}

function TaskListRow({
  busy,
  first,
  members,
  onToggle,
  referenceDate,
  task,
}: {
  busy: boolean;
  first: boolean;
  members: HeuteMember[];
  onToggle: () => void;
  referenceDate: Date;
  task: HeuteTask;
}) {
  const due = formatDueLabel(task.dueDate, referenceDate);
  const assignee = findMember(members, task.assignedTo);
  const subtitle = [task.description, due?.text ?? (task.dueDate ? null : "Ohne Frist")]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={[styles.taskRow, !first && styles.taskRowDivider]}>
      <TaskCheck
        accessibilityLabel={`${task.title} als erledigt markieren`}
        busy={busy}
        done={false}
        onToggle={onToggle}
      />
      <View style={styles.rowContent}>
        <Text numberOfLines={2} style={[typography.title, styles.rowTitle]}>
          {task.title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[
              typography.timestamp,
              styles.rowSubtitle,
              due?.overdue && styles.rowSubtitleOverdue,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {assignee ? <PersonAvatar person={assignee} size={28} /> : null}
    </View>
  );
}

function AgendaRow({
  busy,
  entry,
  members,
  onOpenEvent,
  onToggleTask,
}: {
  busy: boolean;
  entry: HeuteAgendaEntry;
  members: HeuteMember[];
  onOpenEvent: (eventId: string) => void;
  onToggleTask: (task: HeuteTask) => Promise<boolean>;
}) {
  if (entry.kind === "task" && entry.task) {
    const task = entry.task;
    const assignee = findMember(members, task.assignedTo);
    return (
      <View style={styles.agendaRow}>
        <TaskCheck
          accessibilityLabel={`${entry.title} als erledigt markieren`}
          busy={busy}
          done={false}
          onToggle={() => void onToggleTask(task)}
          size={24}
        />
        <Text numberOfLines={2} style={[typography.title, styles.rowTitle, styles.agendaTitle]}>
          {entry.title}
        </Text>
        {assignee ? <PersonAvatar person={assignee} size={26} /> : null}
      </View>
    );
  }
  const people = entry.occurrence ? peopleForOccurrence(entry.occurrence, members) : [];
  return (
    <Pressable
      accessibilityHint="Öffnet den Termin im Plan"
      accessibilityLabel={entry.title}
      accessibilityRole="button"
      onPress={() => entry.occurrence && onOpenEvent(entry.occurrence.id)}
      style={({ pressed }) => [styles.agendaRow, pressed && styles.pressed]}
    >
      <View style={styles.agendaTime}>
        <Text style={[styles.timeText, !entry.time && styles.timeTextAllDay]}>
          {entry.time ?? "Ganztags"}
        </Text>
      </View>
      <View style={styles.rowContent}>
        <Text numberOfLines={2} style={[typography.title, styles.rowTitle]}>
          {entry.title}
        </Text>
        {entry.location ? (
          <View style={styles.agendaLocation}>
            <MapPin color={colors.mist} size={12} strokeWidth={2} />
            <Text numberOfLines={1} style={[typography.timestamp, styles.rowSubtitle]}>
              {entry.location}
            </Text>
          </View>
        ) : null}
      </View>
      {people.length > 0 ? <AvatarStack people={people} size={26} /> : null}
    </Pressable>
  );
}

function DocumentListRow({
  document,
  first,
  onPress,
}: {
  document: HeuteDocument;
  first: boolean;
  onPress: () => void;
}) {
  const kind = getDocumentKind(document.documentType);
  const KindIcon = kind.icon;
  const isNew = document.status === "analyzed";
  const processing = !isNew && document.status !== "confirmed";
  return (
    <ListRow
      accessibilityHint={isNew ? "Öffnet das Dokument zum Prüfen" : "Öffnet das Dokument"}
      accessibilityLabel={`${document.title ?? document.originalFilename ?? "Dokument"}${isNew ? ", neu" : ""}`}
      first={first}
      leading={
        <IconTile tint={kind.tint}>
          <KindIcon color={kind.ink} size={20} strokeWidth={1.9} />
        </IconTile>
      }
      onPress={onPress}
      subtitle={
        processing
          ? "Ordilo liest noch …"
          : document.summary ?? kind.label
      }
      title={document.title ?? document.originalFilename ?? "Dokument"}
      trailing={
        isNew ? (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>Neu</Text>
          </View>
        ) : document.people.length > 0 ? (
          <AvatarStack people={document.people} size={26} />
        ) : undefined
      }
    />
  );
}

function InboundDiscoveryCard({
  discovery,
  busySuggestionId,
  busyRetention,
  onSuggestion,
  onRetention,
}: {
  discovery: HeuteInboundDiscovery;
  busySuggestionId: string | null;
  busyRetention: boolean;
  onSuggestion: (suggestion: HeuteInboundSuggestion, accept: boolean) => Promise<void>;
  onRetention: (discovery: HeuteInboundDiscovery, keep: boolean) => Promise<void>;
}) {
  const hasSuggestions = discovery.suggestions.length > 0;
  const [deleteEmailOpen, setDeleteEmailOpen] = useState(false);
  const confirmDeleteEmail = useCallback(() => {
    setDeleteEmailOpen(true);
  }, []);
  const headline = hasSuggestions
    ? discovery.suggestions.length === 1
      ? discovery.suggestions[0]!.kind === "calendar_event"
        ? "Ein Termin aus einer E-Mail"
        : "Eine Aufgabe aus einer E-Mail"
      : `${discovery.suggestions.length} Funde aus einer E-Mail`
    : "Eine E-Mail ist gelesen";
  return (
    <>
      <Card style={styles.inboundCard}>
        <View style={styles.inboundHeader}>
          <IconTile tint={colors.warmWhite}>
            <Inbox color={colors.harborBlue} size={20} />
          </IconTile>
          <View style={styles.rowContent}>
            <Text style={[typography.title, styles.rowTitle]}>{headline}</Text>
            <Text numberOfLines={2} style={[typography.timestamp, styles.rowSubtitle]}>
              Von {formatInboundSender(discovery.fromAddress)}
              {discovery.subject ? ` · ${discovery.subject}` : ""}
            </Text>
          </View>
        </View>

        {hasSuggestions ? (
          discovery.suggestions.map((suggestion) => {
            const busy = busySuggestionId === suggestion.id;
            const isEvent = suggestion.kind === "calendar_event";
            return (
              <View key={suggestion.id} style={styles.inboundSuggestion}>
                <View style={styles.inboundSuggestionTitle}>
                  {isEvent ? (
                    <CalendarDays color={colors.harborBlue} size={16} />
                  ) : (
                    <ListChecks color={colors.harborBlue} size={16} />
                  )}
                  <Text style={[typography.caption, styles.inboundKind]}>
                    {isEvent ? "Termin" : "Aufgabe"}
                  </Text>
                </View>
                <Text style={[typography.title, styles.rowTitle]}>
                  {suggestion.title}
                </Text>
                <Text style={[typography.timestamp, styles.inboundWhen]}>
                  {formatInboundWhen(suggestion)}
                </Text>
                {suggestion.location ? (
                  <View style={styles.inboundLocation}>
                    <MapPin color={colors.mistDark} size={14} />
                    <Text style={[typography.timestamp, styles.rowSubtitle]}>
                      {suggestion.location}
                    </Text>
                  </View>
                ) : null}
                {suggestion.note ? (
                  <Text style={[typography.timestamp, styles.rowSubtitle]}>
                    {suggestion.note}
                  </Text>
                ) : null}
                <View style={styles.inboundActions}>
                  <OrdiloButton
                    disabled={busy}
                    icon={busy ? undefined : <Check color={colors.warmWhite} size={16} strokeWidth={2.4} />}
                    onPress={() => void onSuggestion(suggestion, true)}
                    title={busy ? "Einen Moment …" : isEvent ? "In den Kalender" : "Auf die Liste"}
                  />
                  <OrdiloButton
                    disabled={busy}
                    onPress={() => void onSuggestion(suggestion, false)}
                    title="Nein, danke"
                    variant="ghost"
                  />
                </View>
              </View>
            );
          })
        ) : discovery.retentionPending ? (
          <View style={styles.retention}>
            <Text style={[typography.title, styles.rowTitle]}>
              Und die E-Mail selbst?
            </Text>
            <Text style={[typography.timestamp, styles.rowSubtitle]}>
              Ordilo kann sie für euch behalten oder vom Server löschen. Was
              eingetragen ist, bleibt so oder so.
            </Text>
            <View style={styles.inboundActions}>
              <OrdiloButton
                disabled={busyRetention}
                onPress={() => void onRetention(discovery, true)}
                title={busyRetention ? "Einen Moment …" : "Behalten"}
              />
              <OrdiloButton
                disabled={busyRetention}
                onPress={confirmDeleteEmail}
                title="Löschen"
                variant="ghost"
              />
            </View>
          </View>
        ) : null}
      </Card>
      <ConfirmDialog
        cancelLabel="Behalten"
        confirmLabel="E-Mail löschen"
        message="Die E-Mail wird von Ordilo gelöscht. Aufgaben und Termine, die du übernommen hast, bleiben erhalten."
        onCancel={() => setDeleteEmailOpen(false)}
        onConfirm={() => {
          setDeleteEmailOpen(false);
          void onRetention(discovery, false);
        }}
        title="E-Mail löschen?"
        visible={deleteEmailOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  loadingList: {
    paddingTop: spacing.sm,
  },
  loadingGap: { height: spacing.lg },
  scrollContent: {
    gap: spacing.xl,
    paddingBottom: MOBILE_DOCK_CONTENT_INSET,
  },
  pressed: { opacity: 0.78 },
  homeHeader: {
    gap: spacing.xl,
    paddingTop: spacing.xs,
  },
  brandRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  wordmark: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  brandName: {
    color: colors.graphite,
    fontFamily: typography.largeTitle.fontFamily,
    fontSize: 25,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  brandPromise: {
    color: colors.mistDark,
    ...typography.label,
  },
  familySummary: {
    alignItems: "flex-end",
    gap: 2,
    maxWidth: "55%",
  },
  dateLine: {
    color: colors.mistDark,
    textTransform: "capitalize",
    ...typography.timestamp,
  },
  familyButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  familyPlaceholder: {
    backgroundColor: colors.sandLight,
    borderRadius: 17,
    height: 34,
    width: 34,
  },
  addFamilyMember: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderColor: colors.warmWhite,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 32,
    justifyContent: "center",
    marginLeft: -8,
    width: 32,
  },
  greetingBlock: { gap: spacing.xs },
  greeting: {
    color: colors.graphite,
    fontFamily: typography.largeTitle.fontFamily,
    fontSize: 38,
    letterSpacing: -1.1,
    lineHeight: 41,
  },
  daySummary: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  dayBrief: {
    gap: spacing.md,
  },
  dayBriefIntro: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  dayBriefCharacter: {
    alignItems: "center",
    height: 108,
    justifyContent: "center",
    width: 148,
  },
  dayBriefMessage: {
    color: colors.graphite,
    flex: 1,
    ...typography.heading,
    fontFamily: typography.body.fontFamily,
  },
  priorityPanel: {
    borderLeftColor: colors.harborBlue,
    borderLeftWidth: 1,
    gap: spacing.sm,
    marginLeft: spacing.xs,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
  },
  priorityLabel: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  priorityLabelOverdue: { color: colors.warmApricot },
  priorityTitle: {
    color: colors.graphite,
    ...typography.display,
  },
  priorityText: {
    color: colors.mistDark,
    ...typography.body,
  },
  priorityMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  briefingPerson: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  briefingMetaText: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  sourceChip: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: radii.base,
    flexDirection: "row",
    gap: 6,
    maxWidth: "100%",
    minHeight: 32,
    paddingHorizontal: 10,
  },
  sourceChipText: {
    color: colors.mistDark,
    flexShrink: 1,
    ...typography.caption,
  },
  priorityActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  priorityPeople: {
    marginVertical: spacing.xs,
  },
  doneAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: sizes.touch,
    paddingHorizontal: spacing.sm,
  },
  doneActionText: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  briefingDocument: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: 12,
    marginTop: spacing.xs,
    minHeight: 64,
    padding: 12,
  },
  briefingGo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  briefingGoText: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  calmNext: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.sand,
    borderRadius: radii.base,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  calmNextText: {
    color: colors.graphite,
    flexShrink: 1,
    ...typography.timestamp,
  },
  calmNextLead: {
    color: colors.mistDark,
  },
  briefingLink: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 32,
  },
  briefingLinkText: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  firstVisit: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  firstVisitTitle: {
    color: colors.graphite,
    marginTop: spacing.sm,
    textAlign: "center",
    ...typography.heading,
  },
  firstVisitText: {
    color: colors.mistDark,
    marginBottom: spacing.md,
    maxWidth: 320,
    textAlign: "center",
    ...typography.body,
  },
  firstVisitLink: {
    justifyContent: "center",
    minHeight: 44,
  },
  firstVisitLinkText: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  section: { gap: spacing.sm },
  todayList: {
    backgroundColor: "transparent",
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
  },
  rowContent: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { color: colors.graphite },
  rowSubtitle: { color: colors.mistDark },
  rowSubtitleOverdue: { color: colors.warmApricot, fontFamily: typography.title.fontFamily },
  timeColumn: {
    alignItems: "center",
    justifyContent: "center",
    width: sizes.tile,
  },
  timeText: {
    color: colors.harborBlue,
    textAlign: "center",
    ...typography.caption,
  },
  timeTextAllDay: {
    color: colors.mistDark,
    fontSize: 11,
    lineHeight: 13,
  },
  taskRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 60,
    paddingLeft: 4,
    paddingRight: 14,
    paddingVertical: 8,
  },
  taskRowDivider: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayLabelRow: {
    paddingBottom: 2,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  dayLabelRowDivider: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayLabel: {
    color: colors.mistDark,
    ...typography.caption,
  },
  agendaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  agendaTitle: { flex: 1 },
  agendaTime: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
  },
  agendaLocation: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  newPill: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  newPillText: {
    color: colors.warmWhite,
    ...typography.caption,
  },
  insight: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  inboundCard: {
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.md,
    gap: spacing.md,
    padding: spacing.md,
  },
  inboundHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  inboundSuggestion: {
    backgroundColor: colors.warmWhite,
    borderRadius: radii.sm,
    gap: spacing.sm,
    padding: 12,
  },
  inboundSuggestionTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  inboundKind: { color: colors.harborBlue },
  inboundWhen: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
  },
  inboundLocation: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  inboundActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  retention: { gap: spacing.sm },
});
