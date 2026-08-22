import { useRouter } from "expo-router";
import {
  CalendarDays,
  Check,
  Clock3,
  FileText,
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
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Card, EmptyState, OrdiloButton, Screen } from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import {
  acceptInboundSuggestion,
  decideInboundEmailRetention,
  dismissInboundSuggestion,
  formatDueLabel,
  formatInboundSender,
  getDatedOpenTasks,
  getDiscoveryInsight,
  getEventOccurrences,
  getHomeGreeting,
  getHomePriorityTask,
  getInboundHeadline,
  getTodayEvents,
  getTodayTasks,
  getUpcomingEntries,
  loadHeuteData,
  mergeJournalDocuments,
  formatInboundWhen,
  setHeuteTaskStatus,
  type HeuteData,
  type HeuteInboundDiscovery,
  type HeuteInboundSuggestion,
  type HeuteTask,
} from "@/src/lib/heute";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Heute — the native home for a family's next useful action.
 *
 * This is deliberately a calm briefing, not a dashboard: one hero takes
 * responsibility for the most urgent task, grouped sections answer what is
 * happening today, and documents/inbound discoveries stay actionable without
 * surfacing raw processing machinery. Reads are the same RLS queries as the
 * web Home server component (src/app/(app)/home/page.tsx).
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

  // Keep date-derived groups truthful after midnight and when the app comes
  // back to foreground. The data itself remains fresh via pull-to-refresh.
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshClock = () => setClock(Date.now());
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).getTime();
      midnightTimer = setTimeout(() => {
        refreshClock();
        scheduleMidnight();
      }, nextMidnight - now.getTime() + 100);
    };
    scheduleMidnight();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshClock();
    });
    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);

  const referenceDate = useMemo(() => new Date(clock), [clock]);
  const datedTasks = useMemo(() => getDatedOpenTasks(tasks), [tasks]);
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
  const upcomingEntries = useMemo(
    () => getUpcomingEntries(tasks, eventOccurrences, referenceDate),
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
  const discoveryInsight = useMemo(
    () => getDiscoveryInsight(journalDocuments),
    [journalDocuments],
  );

  const isFirstVisit =
    !datedTasks.length &&
    !todayEvents.length &&
    !journalDocuments.length &&
    !discoveries.length;
  const heroTask = useMemo(
    () => getHomePriorityTask(tasks, referenceDate),
    [tasks, referenceDate],
  );
  const nextTasks = useMemo(
    () =>
      datedTasks
        .filter((task) => task.id !== heroTask?.id)
        .slice(0, 3),
    [datedTasks, heroTask?.id],
  );

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

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.harborBlue} />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen style={styles.center}>
        <EmptyState
          icon={Clock3}
          heading="Heute konnte nicht geladen werden"
          description={error}
        >
          <OrdiloButton
            onPress={() => void load()}
            size="lg"
            title="Erneut versuchen"
          />
        </EmptyState>
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
        <HeuteHero
          familyName={family?.name ?? "eurer Familie"}
          heroTask={heroTask}
          memberNames={data?.members ?? []}
          onCompleteTask={toggleTask}
          referenceDate={referenceDate}
          taskBusy={mutatingTaskId === heroTask?.id}
        />

        {error ? (
          <View accessibilityRole="alert" style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}>
              <Text style={styles.inlineErrorDismiss}>Schließen</Text>
            </Pressable>
          </View>
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

        {isFirstVisit ? (
          <EmptyState
            icon={Sparkles}
            heading="Schön, dass du da bist"
            description="Scanne dein erstes Dokument und Ordilo bringt Ordnung in deinen Papierkram — ganz ohne Aktenordner."
          >
            <OrdiloButton
              icon={<ScanLine color={colors.warmWhite} size={18} />}
              onPress={() => router.push("/scan")}
              size="lg"
              title="Dokument scannen"
            />
          </EmptyState>
        ) : (
          <>
            {(todayEvents.length > 0 || todayTasks.length > 0) && (
              <Section title="Heute">
                {todayEvents.map((event) => (
                  <TodayEventRow event={event} key={`${event.id}-${event.date}`} />
                ))}
                {todayTasks.map((task) => (
                  <TodayTaskRow
                    busy={mutatingTaskId === task.id}
                    key={task.id}
                    onToggle={() => void toggleTask(task)}
                    referenceDate={referenceDate}
                    task={task}
                  />
                ))}
              </Section>
            )}

            {upcomingEntries.length > 0 ? (
              <View style={styles.upcoming}>
                <CalendarDays color={colors.harborBlue} size={20} />
                <View style={styles.upcomingText}>
                  <Text style={[typography.title, styles.upcomingTitle]}>
                    Demnächst
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[typography.timestamp, styles.upcomingDescription]}
                  >
                    {formatUpcomingCopy(upcomingEntries)}
                  </Text>
                </View>
              </View>
            ) : null}

            {journalDocuments.length > 0 ? (
              <Section title="Deine Dokumente">
                {data?.unconfirmedDocumentCount ? (
                  <View style={styles.documentNotice}>
                    <Text style={styles.documentNoticeText}>
                      {data.unconfirmedDocumentCount === 1
                        ? "1 neues Dokument"
                        : `${data.unconfirmedDocumentCount} neue Dokumente`}
                    </Text>
                  </View>
                ) : (
                  <Text style={[typography.timestamp, styles.sectionContext]}>
                    {data?.journalDocumentCount === 1
                      ? "1 Dokument im Familienbuch"
                      : `${data?.journalDocumentCount ?? 0} Dokumente im Familienbuch`}
                  </Text>
                )}
                {journalDocuments.map((document) => (
                  <View
                    key={document.id}
                    style={[
                      styles.documentRow,
                      document.status === "analyzed" && styles.documentRowPending,
                    ]}
                  >
                    <View style={styles.documentIcon}>
                      <FileText
                        color={colors.mistDark}
                        size={20}
                        strokeWidth={1.8}
                      />
                    </View>
                    <View style={styles.rowContent}>
                      <Text
                        numberOfLines={1}
                        style={[typography.title, styles.rowTitle]}
                      >
                        {document.title ??
                          document.originalFilename ??
                          "Dokument"}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[typography.timestamp, styles.rowSubtitle]}
                      >
                        {document.summary ?? getDocumentStatusLabel(document.status)}
                      </Text>
                    </View>
                    {document.status === "analyzed" ? (
                      <Text style={styles.reviewPill}>Neu</Text>
                    ) : null}
                  </View>
                ))}
              </Section>
            ) : null}

            {nextTasks.length > 0 ? (
              <Section title="Als Nächstes">
                {nextTasks.map((task) => (
                  <TodayTaskRow
                    busy={mutatingTaskId === task.id}
                    key={task.id}
                    onToggle={() => void toggleTask(task)}
                    referenceDate={referenceDate}
                    task={task}
                  />
                ))}
              </Section>
            ) : null}

            {discoveryInsight ? (
              <View style={styles.discoveryInsight}>
                <View style={styles.insightIcon}>
                  <Sparkles color={colors.harborBlue} size={18} />
                </View>
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
              </View>
            ) : null}
          </>
        )}

      </ScrollView>
    </Screen>
  );
}

function HeuteHero({
  familyName,
  heroTask,
  memberNames,
  onCompleteTask,
  referenceDate,
  taskBusy,
}: {
  familyName: string;
  heroTask: HeuteTask | null;
  memberNames: HeuteData["members"];
  onCompleteTask: (task: HeuteTask) => Promise<void>;
  referenceDate: Date;
  taskBusy: boolean;
}) {
  const due = heroTask ? formatDueLabel(heroTask.dueDate, referenceDate) : null;
  const isOverdue = due?.overdue ?? false;
  const dateLine = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(referenceDate);

  return (
    <View
      style={[
        styles.hero,
        heroTask
          ? isOverdue
            ? styles.heroOverdue
            : styles.heroTask
          : styles.heroCalm,
      ]}
    >
      <View style={styles.heroTop}>
        <View style={styles.heroGreeting}>
          <Text style={[typography.timestamp, styles.heroDate]}>{dateLine}</Text>
          <Text style={styles.heroTitle}>{getHomeGreeting()}</Text>
          <Text style={[typography.timestamp, styles.heroFamily]}>
            {familyName}
          </Text>
        </View>
        <AvatarStack members={memberNames} />
      </View>

      {heroTask ? (
        <View style={styles.heroTaskRow}>
          <Pressable
            accessibilityLabel={`${heroTask.title} als erledigt markieren`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: false, disabled: taskBusy }}
            disabled={taskBusy}
            onPress={() => void onCompleteTask(heroTask)}
            style={({ pressed }) => [
              styles.heroCheckbox,
              pressed && styles.pressed,
              taskBusy && styles.disabled,
            ]}
          >
            {taskBusy ? (
              <ActivityIndicator color={colors.harborBlue} size="small" />
            ) : (
              <Check color={colors.harborBlue} size={19} strokeWidth={2.5} />
            )}
          </Pressable>
          <View style={styles.heroTaskContent}>
            <Text style={styles.heroTaskBadge}>
              {isOverdue ? "Überfällig" : due?.text === "Morgen" ? "Morgen" : "Jetzt dran"}
            </Text>
            <Text numberOfLines={2} style={styles.heroTaskTitle}>
              {heroTask.title}
            </Text>
            {due ? (
              <Text
                style={[
                  typography.timestamp,
                  styles.heroTaskDue,
                  isOverdue && styles.heroTaskDueOverdue,
                ]}
              >
                {due.text}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.calmRow}>
          <View style={styles.calmSparkle}>
            <Sparkles color={colors.harborBlue} size={18} />
          </View>
          <View>
            <Text style={styles.calmTitle}>Alles im grünen Bereich</Text>
            <Text style={[typography.timestamp, styles.calmText]}>
              Keine Fristen heute oder morgen.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function AvatarStack({ members }: { members: HeuteData["members"] }) {
  const visible = members.slice(0, 3);
  return (
    <View accessibilityLabel="Familienmitglieder" style={styles.avatars}>
      {visible.map((member, index) => (
        <View
          key={member.id}
          style={[
            styles.avatar,
            { backgroundColor: member.avatarColor ?? colors.harborBlue },
            index > 0 && styles.avatarOverlap,
          ]}
        >
          <Text style={styles.avatarText}>
            {member.name.trim().charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
      ))}
      {members.length > visible.length ? (
        <View style={[styles.avatar, styles.avatarOverflow, styles.avatarOverlap]}>
          <Text style={styles.avatarOverflowText}>+{members.length - visible.length}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[typography.display, styles.sectionTitle]}>{title}</Text>
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction}>
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

function TodayEventRow({
  event,
}: {
  event: ReturnType<typeof getTodayEvents>[number];
}) {
  return (
    <View style={styles.timelineRow}>
      <Text style={[typography.label, styles.timelineTime]}>
        {event.startsTime ?? "Ganztägig"}
      </Text>
      <View style={styles.eventDot} />
      <View style={styles.rowContent}>
        <Text numberOfLines={1} style={[typography.title, styles.rowTitle]}>
          {event.title}
        </Text>
        {event.attendeeNames.length > 0 || event.location ? (
          <Text numberOfLines={1} style={[typography.timestamp, styles.rowSubtitle]}>
            {event.attendeeNames.join(" & ") || event.location}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function TodayTaskRow({
  task,
  onToggle,
  busy,
  referenceDate,
}: {
  task: HeuteTask;
  onToggle: () => void;
  busy: boolean;
  referenceDate: Date;
}) {
  const due = formatDueLabel(task.dueDate, referenceDate);
  return (
    <View style={styles.timelineRow}>
      <Pressable
        accessibilityLabel={`${task.title} als erledigt markieren`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false, disabled: busy }}
        disabled={busy}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.taskCheckbox,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.harborBlue} size="small" />
        ) : (
          <Check color={colors.harborBlue} size={15} strokeWidth={2.5} />
        )}
      </Pressable>
      <View style={[styles.taskDot, due?.overdue && styles.taskDotOverdue]} />
      <View style={styles.rowContent}>
        <Text numberOfLines={2} style={[typography.title, styles.rowTitle]}>
          {task.title}
        </Text>
        {task.description || due ? (
          <Text
            numberOfLines={1}
            style={[
              typography.timestamp,
              styles.rowSubtitle,
              due?.overdue && styles.rowSubtitleOverdue,
            ]}
          >
            {task.description ?? due?.text}
            {task.description && due ? ` · ${due.text}` : ""}
          </Text>
        ) : null}
      </View>
    </View>
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
  return (
    <Card style={styles.inboundCard}>
      <View style={styles.inboundHeader}>
        <View style={styles.inboundIcon}>
          <Inbox color={colors.harborBlue} size={20} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[typography.title, styles.rowTitle]}>
            {getInboundHeadline(discovery)}
          </Text>
          <Text style={[typography.timestamp, styles.rowSubtitle]}>
            Aus einer E-Mail von {formatInboundSender(discovery.fromAddress)}.
          </Text>
        </View>
      </View>

      {discovery.subject ? (
        <Text style={[typography.label, styles.inboundSubject]}>
          Betreff: {discovery.subject}
        </Text>
      ) : null}

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
                <Text style={[typography.label, styles.inboundKind]}>
                  {isEvent ? "Termin" : "Aufgabe"}
                </Text>
              </View>
              <Text style={[typography.title, styles.rowTitle]}>
                {suggestion.title}
              </Text>
              {suggestion.location ? (
                <View style={styles.inboundLocation}>
                  <MapPin color={colors.mistDark} size={14} />
                  <Text style={[typography.timestamp, styles.rowSubtitle]}>
                    {suggestion.location}
                  </Text>
                </View>
              ) : null}
              <Text style={[typography.timestamp, styles.inboundWhen]}>
                {formatInboundWhen(suggestion)}
              </Text>
              {suggestion.note ? (
                <Text style={[typography.timestamp, styles.rowSubtitle]}>
                  {suggestion.note}
                </Text>
              ) : null}
              <View style={styles.inboundActions}>
                <OrdiloButton
                  disabled={busy}
                  onPress={() => void onSuggestion(suggestion, true)}
                  title={busy ? "Einen Moment…" : isEvent ? "In den Kalender" : "Auf die Liste"}
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
            Ich kann sie für euch behalten oder von unserem Server löschen.
            Was eingetragen ist, bleibt so oder so.
          </Text>
          <View style={styles.inboundActions}>
            <OrdiloButton
              disabled={busyRetention}
              onPress={() => void onRetention(discovery, false)}
              title={busyRetention ? "Einen Moment…" : "Bitte löschen"}
            />
            <OrdiloButton
              disabled={busyRetention}
              onPress={() => void onRetention(discovery, true)}
              title="Behalten"
              variant="outline"
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function formatUpcomingCopy(
  entries: { id: string; title: string; date: string }[],
): string {
  const names = entries
    .slice(0, 2)
    .map((entry) => entry.title)
    .join(" · ");
  return `${entries.length} ${entries.length === 1 ? "Ding" : "Dinge"} in den nächsten 7 Tagen · ${names}`;
}

function getDocumentStatusLabel(status: string): string {
  switch (status) {
    case "confirmed":
      return "Bestätigt";
    case "analyzed":
      return "Bitte bestätigen";
    case "processing":
      return "Wird vorbereitet";
    default:
      return "Dokument";
  }
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing["2xl"],
    paddingTop: spacing.md,
  },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.6 },
  hero: {
    borderRadius: radii.md,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroCalm: { backgroundColor: "#E8F0EC" },
  heroTask: { backgroundColor: colors.blueSoft },
  heroOverdue: { backgroundColor: "#FAE8DE" },
  heroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroGreeting: { gap: spacing.xs },
  heroDate: {
    color: colors.mistDark,
    textTransform: "capitalize",
  },
  heroTitle: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  heroFamily: { color: colors.mistDark },
  avatars: { flexDirection: "row", paddingLeft: spacing.sm },
  avatar: {
    alignItems: "center",
    borderColor: colors.warmWhite,
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarOverlap: { marginLeft: -10 },
  avatarText: {
    color: colors.warmWhite,
    fontFamily: typography.label.fontFamily,
  },
  avatarOverflow: { backgroundColor: colors.sandWarm },
  avatarOverflowText: {
    color: colors.graphite,
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
  },
  heroTaskRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  heroCheckbox: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.harborBlue,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  heroTaskContent: { flex: 1, gap: spacing.xs },
  heroTaskBadge: {
    color: colors.harborBlue,
    fontFamily: typography.label.fontFamily,
    fontSize: typography.label.fontSize,
  },
  heroTaskTitle: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
    fontSize: 18,
    lineHeight: 24,
  },
  heroTaskDue: { color: colors.mistDark },
  heroTaskDueOverdue: { color: colors.warmApricot, fontWeight: "600" },
  calmRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  calmSparkle: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  calmTitle: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
    fontSize: 17,
  },
  calmText: { color: colors.mistDark, marginTop: 2 },
  inlineError: {
    alignItems: "center",
    backgroundColor: "rgba(192, 57, 43, 0.06)",
    borderColor: "rgba(192, 57, 43, 0.25)",
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: 12,
  },
  inlineErrorText: {
    color: colors.destructive,
    flex: 1,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
  },
  inlineErrorDismiss: {
    color: colors.destructive,
    fontFamily: typography.label.fontFamily,
  },
  section: { gap: spacing.sm },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.graphite },
  sectionAction: {
    color: colors.harborBlue,
    fontFamily: typography.label.fontFamily,
    fontSize: typography.label.fontSize,
  },
  sectionCard: { gap: spacing.sm, padding: 0 },
  sectionContext: {
    color: colors.mistDark,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  documentNotice: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F0EC",
    borderRadius: radii.pill,
    marginLeft: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  documentNoticeText: {
    color: colors.harborBlueDarker,
    fontFamily: typography.label.fontFamily,
    fontSize: typography.label.fontSize,
  },
  timelineRow: {
    alignItems: "center",
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  timelineTime: {
    color: colors.mistDark,
    textAlign: "right",
    width: 58,
  },
  eventDot: {
    backgroundColor: colors.harborBlue,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  taskDot: {
    backgroundColor: colors.warmApricot,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  taskDotOverdue: { backgroundColor: colors.warmApricot },
  taskCheckbox: {
    alignItems: "center",
    borderColor: colors.harborBlue,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  rowContent: { flex: 1, gap: 2 },
  rowTitle: { color: colors.graphite },
  rowSubtitle: { color: colors.mistDark },
  rowSubtitleOverdue: { color: colors.warmApricot, fontWeight: "600" },
  upcoming: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  upcomingText: { flex: 1, gap: 1 },
  upcomingTitle: { color: colors.graphite },
  upcomingDescription: { color: colors.mistDark },
  documentRow: {
    alignItems: "center",
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  documentRowPending: { backgroundColor: "#F2F7F4" },
  documentIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.base,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  reviewPill: {
    color: colors.harborBlueDarker,
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
    maxWidth: 90,
    textAlign: "right",
  },
  discoveryInsight: {
    alignItems: "center",
    backgroundColor: "#E8F0EC",
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  insightIcon: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  inboundCard: {
    backgroundColor: "#E8F0EC",
    gap: spacing.md,
    padding: spacing.md,
  },
  inboundHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  inboundIcon: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  inboundSubject: { color: colors.mistDark },
  inboundSuggestion: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
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
