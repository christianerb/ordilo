import { useRouter } from "expo-router";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Inbox,
  ListChecks,
  MapPin,
  ScanLine,
  Sparkles,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { AmbientFields } from "@/src/components/ambient-fields";
import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { OrdiloCharacter } from "@/src/components/ordilo-character";
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
  ScreenHeader,
  SectionHeader,
  Skeleton,
} from "@/src/components/ui";
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
  const [data, setData] = useState<HeuteData | null>(null);
  const [tasks, setTasks] = useState<HeuteTask[]>([]);
  const [discoveries, setDiscoveries] = useState<HeuteInboundDiscovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);
  const [mutatingSuggestionId, setMutatingSuggestionId] = useState<
    string | null
  >(null);
  const [mutatingRetentionId, setMutatingRetentionId] = useState<
    string | null
  >(null);
  const [clock, setClock] = useState(() => Date.now());

  const load = useCallback(
    async (isRefresh = false) => {
      if (!family) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await loadHeuteData(family.id);
        setData(result);
        setTasks(result.tasks);
        setDiscoveries(result.inboundDiscoveries);
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

  useEffect(() => {
    // The microtask boundary keeps render-to-fetch state updates out of the
    // effect body while still loading immediately after a family resolves.
    void Promise.resolve().then(() => load());
  }, [load]);

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
    () => getHeuteBriefing(tasks, reviewDocuments, upcomingCount, referenceDate),
    [tasks, reviewDocuments, upcomingCount, referenceDate],
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
  const heroTaskId = briefing.kind === "task" ? briefing.task.id : null;
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
      if (!family || mutatingTaskId) return;
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
        void success();
      }
      setMutatingTaskId(null);
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

  const header = (
    <ScreenHeader
      eyebrow={dateLine}
      subtitle={loading ? undefined : daySummary ?? undefined}
      title={getHomeGreeting(referenceDate)}
      trailing={
        <Pressable
          accessibilityHint="Öffnet Familie und Einstellungen"
          accessibilityLabel="Familie"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push("/familie")}
          style={({ pressed }) => [styles.familyButton, pressed && styles.pressed]}
        >
          {people.length > 0 ? (
            <AvatarStack max={3} people={people} size={34} />
          ) : (
            <View style={styles.familyPlaceholder} />
          )}
        </Pressable>
      }
    />
  );

  if (loading) {
    return (
      <Screen>
        <AmbientFields style={styles.ambientBehind} variant="top" />
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
      <AmbientFields style={styles.ambientBehind} variant="top" />
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
            onAsk={() => router.push("/suche")}
            onScan={() => router.push({ pathname: "/scan", params: { auto: "1" } })}
          />
        ) : (
          <BriefingCard
            briefing={briefing}
            members={members}
            onCompleteTask={toggleTask}
            onOpenDocument={openDocument}
            onOpenLibrary={() => router.push("/(tabs)/ablage")}
            taskBusy={mutatingTaskId === heroTaskId}
          />
        )}

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
                action={{ label: "Plan", onPress: () => router.push("/(tabs)/plan") }}
                title="Heute"
              >
                <ListGroup>
                  {todayEvents.map((event, index) => (
                    <TodayEventRow
                      event={event}
                      first={index === 0}
                      key={`${event.id}-${event.date}`}
                      members={members}
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
                          onToggleTask={toggleTask}
                        />
                      ))}
                    </View>
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
    </Screen>
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
  taskBusy,
}: {
  briefing: HeuteBriefing;
  members: HeuteMember[];
  onCompleteTask: (task: HeuteTask) => Promise<void>;
  onOpenDocument: (documentId: string) => void;
  onOpenLibrary: () => void;
  taskBusy: boolean;
}) {
  if (briefing.kind === "task") {
    const { task, due } = briefing;
    const assignee = findMember(members, task.assignedTo);
    const label = due.overdue
      ? "Überfällig"
      : due.text === "Heute"
        ? "Heute dran"
        : "Morgen dran";
    return (
      <Animated.View
        entering={contentEntering()}
        key={`task-${task.id}`}
        style={[styles.briefing, due.overdue ? styles.briefingOverdue : styles.briefingTask]}
      >
        <View style={styles.briefingRow}>
          <View style={styles.briefingCopy}>
            <Text
              style={[
                styles.briefingLabel,
                due.overdue && styles.briefingLabelOverdue,
              ]}
            >
              {label}
            </Text>
            <Text numberOfLines={3} style={styles.briefingTitle}>
              {task.title}
            </Text>
            <View style={styles.briefingMeta}>
              {assignee ? (
                <View style={styles.briefingPerson}>
                  <PersonAvatar person={assignee} size={sizes.avatarSmall} />
                  <Text style={styles.briefingMetaText}>{assignee.name}</Text>
                </View>
              ) : null}
              <Text
                style={[
                  styles.briefingMetaText,
                  due.overdue && styles.briefingMetaOverdue,
                ]}
              >
                {due.overdue
                  ? due.text
                  : task.documentTitle
                    ? `Aus „${task.documentTitle}“`
                    : due.text}
              </Text>
            </View>
          </View>
          <View style={styles.briefingCheck}>
            <TaskCheck
              accessibilityLabel={`${task.title} als erledigt markieren`}
              busy={taskBusy}
              done={false}
              onToggle={() => void onCompleteTask(task)}
              size={34}
            />
          </View>
        </View>
      </Animated.View>
    );
  }

  if (briefing.kind === "review") {
    const kind = getDocumentKind(briefing.document.documentType);
    const KindIcon = kind.icon;
    return (
      <Animated.View
        entering={contentEntering()}
        key="review"
        style={[styles.briefing, styles.briefingReview]}
      >
        <Text style={styles.briefingLabel}>Neu für euch</Text>
        <Text style={styles.briefingTitle}>
          {briefing.count === 1
            ? "Ordilo hat ein Dokument gelesen"
            : `Ordilo hat ${briefing.count} Dokumente gelesen`}
        </Text>
        <Text style={styles.briefingText}>
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
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={contentEntering()}
      key="calm"
      style={[styles.briefing, styles.briefingCalm]}
    >
      <View style={styles.briefingRow}>
        <View style={styles.briefingCopy}>
          <Text style={styles.briefingLabel}>Alles im grünen Bereich</Text>
          <Text style={styles.briefingTitle}>Heute ist nichts dringend.</Text>
          <Text style={styles.briefingText}>
            {briefing.upcomingCount === 0
              ? "Keine Fristen heute oder morgen. Ordilo passt weiter auf."
              : briefing.upcomingCount === 1
                ? "Eine Sache steht in den nächsten Tagen an."
                : `${briefing.upcomingCount} Dinge stehen in den nächsten Tagen an.`}
          </Text>
        </View>
        <View style={styles.calmCharacter}>
          <OrdiloCharacter animated={false} size={64} />
        </View>
      </View>
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
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={onAsk}
        style={({ pressed }) => [styles.firstVisitLink, pressed && styles.pressed]}
      >
        <Text style={styles.firstVisitLinkText}>Oder erst mal Ordilo etwas fragen</Text>
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
}: {
  event: HeuteEventOccurrence;
  first: boolean;
  members: HeuteMember[];
}) {
  const people = peopleForOccurrence(event, members);
  const time = event.startsTime ? event.startsTime.slice(0, 5) : null;
  return (
    <ListRow
      first={first}
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
  onToggleTask,
}: {
  busy: boolean;
  entry: HeuteAgendaEntry;
  members: HeuteMember[];
  onToggleTask: (task: HeuteTask) => Promise<void>;
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
    <View style={styles.agendaRow}>
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
    </View>
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
  // The fields sit behind the padded content and bleed to the edges.
  ambientBehind: {
    marginHorizontal: -spacing.md,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: MOBILE_DOCK_CONTENT_INSET,
  },
  pressed: { opacity: 0.78 },
  familyButton: {
    alignItems: "center",
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
  briefing: {
    borderRadius: radii.lg,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  briefingTask: { backgroundColor: colors.washBlue },
  briefingOverdue: { backgroundColor: "#FAE8DE" },
  briefingReview: { backgroundColor: colors.washSage },
  briefingCalm: { backgroundColor: colors.washSageSoft },
  briefingRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  briefingCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  briefingLabel: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  briefingLabelOverdue: { color: colors.warmApricot },
  briefingTitle: {
    color: colors.graphite,
    ...typography.heading,
  },
  briefingText: {
    color: colors.mistDark,
    ...typography.body,
  },
  briefingMeta: {
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
  briefingMetaOverdue: {
    color: colors.warmApricot,
    fontFamily: typography.title.fontFamily,
  },
  briefingCheck: {
    marginRight: -spacing.sm,
    marginTop: -spacing.xs,
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
  briefingLink: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 32,
  },
  briefingLinkText: {
    color: colors.harborBlue,
    ...typography.caption,
  },
  calmCharacter: {
    marginRight: -spacing.xs,
    marginTop: -spacing.sm,
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
