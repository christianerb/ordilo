"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  Plus,
  Repeat,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EventSheet, type EventTemplate } from "@/components/ordilo/event-sheet";
import type { AssigneeOption } from "@/components/ordilo/task-card";
import {
  calendarDays,
  eventsForDay,
  isSameCalendarDay,
  isSameCalendarMonth,
  monthStart,
  RECURRENCE_LABELS,
  shiftMonth,
  toCalendarDate,
  weekDays,
  type CalendarEvent,
} from "@/lib/calendar";
import { formatGermanDate } from "@/lib/format";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { createClient } from "@/lib/supabase/client";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { cn } from "@/lib/utils";
import { usePlannerActionsOptional } from "./planner-actions-context";
import { VoicePlannerCard } from "./voice-planner";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** An upcoming document-extracted date the family can turn into an event. */
export interface CalendarSuggestion {
  entityId: string;
  date: string;
  label: string | null;
  documentId: string;
  documentTitle: string | null;
}

/**
 * Fallback accent colors for members without an avatar color, assigned by
 * position so each member keeps a stable, distinct hue.
 */
const FALLBACK_MEMBER_COLORS = [
  "#305460",
  "#7a8b5c",
  "#a56a4e",
  "#8d6b94",
  "#b08a3e",
  "#5c7a8b",
];

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/** "Heute · Sonntag, 9. August" / "Morgen · …" / "Dienstag, 11. August". */
function dayHeading(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const long = date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (isSameCalendarDay(date, now)) return `Heute · ${long}`;
  if (isSameCalendarDay(date, tomorrow)) return `Morgen · ${long}`;
  return long;
}

/** "10.–16. August" or "28. Juli – 3. August" for the week header. */
function weekTitle(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const monthLong = (d: Date) =>
    d.toLocaleDateString("de-DE", { month: "long" });
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}.–${last.getDate()}. ${monthLong(first)}`
    : `${first.getDate()}. ${monthLong(first)} – ${last.getDate()}. ${monthLong(last)}`;
}

/** Sort a day's events: all-day first, then by start time. */
function sortDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    return (a.starts_time ?? "").localeCompare(b.starts_time ?? "");
  });
}

/** First grapheme of a name for the avatar chip. */
function initialOf(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase("de") ?? "?";
}

export function CalendarClient({
  initialEvents,
  initialSuggestions = [],
  familyId,
  currentUserId = null,
  members,
}: {
  initialEvents: CalendarEvent[];
  initialSuggestions?: CalendarSuggestion[];
  familyId: string | null;
  currentUserId?: string | null;
  members: AssigneeOption[];
}) {
  const supabase = createClient();
  const today = new Date();
  const [events, setEvents] = useState(initialEvents);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [activeMonth, setActiveMonth] = useState(() => monthStart(today));
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [view, setView] = useState<"week" | "month">("month");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [suggestionTemplate, setSuggestionTemplate] =
    useState<CalendarSuggestion | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const memberColors = useMemo(() => {
    const colors = new Map<string, string>();
    members.forEach((member, index) => {
      colors.set(
        member.id,
        member.avatar_color ||
          FALLBACK_MEMBER_COLORS[index % FALLBACK_MEMBER_COLORS.length],
      );
    });
    return colors;
  }, [members]);

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.name])),
    [members],
  );

  /** Accent color for an event: responsible member first, else first attendee. */
  const eventColor = useCallback(
    (event: CalendarEvent): string | null => {
      if (event.responsible_member_id) {
        return memberColors.get(event.responsible_member_id) ?? null;
      }
      const first = event.attendees[0];
      return first ? memberColors.get(first.id) ?? null : null;
    },
    [memberColors],
  );

  /** Events narrowed to the selected person (attendee or responsible). */
  const filteredEvents = useMemo(() => {
    if (!memberFilter) return events;
    return events.filter(
      (event) =>
        event.responsible_member_id === memberFilter ||
        event.attendees.some((attendee) => attendee.id === memberFilter),
    );
  }, [events, memberFilter]);

  const days = useMemo(() => calendarDays(activeMonth), [activeMonth]);
  const selectedEvents = useMemo(
    () => eventsForDay(filteredEvents, selectedDate),
    [filteredEvents, selectedDate],
  );
  const monthTitle = activeMonth.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  const openCreate = useCallback(() => {
    setEditingEvent(null);
    setSuggestionTemplate(null);
    setSheetOpen(true);
  }, []);

  // ---------------------------------------------------------------------
  // Live family sync: when someone else adds or edits an event, it shows
  // up here without a reload, marked "Neu" until this user has seen it.
  // ---------------------------------------------------------------------

  const eventsRef = useRef(events);
  eventsRef.current = events;
  /** Events flagged new this session keep their badge while it's open. */
  const sessionNewRef = useRef<Set<string>>(
    new Set(initialEvents.filter((e) => e.is_new).map((e) => e.id)),
  );

  /** Re-fetch the family's events (RLS-scoped) and merge enrichments. */
  const refreshEvents = useCallback(async () => {
    if (!familyId) return;
    const { data: rows } = await supabase
      .from("calendar_events")
      .select(
        "id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id, document_id, created_by",
      )
      .eq("family_id", familyId)
      .order("starts_on", { ascending: true });
    if (!rows) return;

    const ids = rows.map((row) => row.id);
    const [attendeeResult, seenResult] = await Promise.all([
      ids.length
        ? supabase
            .from("calendar_event_attendees")
            .select("event_id, family_member_id")
            .in("event_id", ids)
        : Promise.resolve({ data: [] as { event_id: string; family_member_id: string }[] }),
      currentUserId
        ? supabase.from("calendar_event_seen").select("event_id")
        : Promise.resolve({ data: [] as { event_id: string }[] }),
    ]);

    const attendeesByEvent = new Map<string, { id: string; name: string }[]>();
    for (const attendee of attendeeResult.data ?? []) {
      const list = attendeesByEvent.get(attendee.event_id) ?? [];
      list.push({
        id: attendee.family_member_id,
        name: memberNames.get(attendee.family_member_id) ?? "Familienmitglied",
      });
      attendeesByEvent.set(attendee.event_id, list);
    }
    const seenIds = new Set((seenResult.data ?? []).map((row) => row.event_id));
    const previousById = new Map(eventsRef.current.map((e) => [e.id, e]));

    const next: CalendarEvent[] = rows.map((row) => {
      const isNew = Boolean(
        currentUserId &&
          row.created_by &&
          row.created_by !== currentUserId &&
          (!seenIds.has(row.id) || sessionNewRef.current.has(row.id)),
      );
      if (isNew) sessionNewRef.current.add(row.id);
      return {
        ...row,
        recurrence: row.recurrence as CalendarEvent["recurrence"],
        recurrence_exceptions: row.recurrence_exceptions ?? [],
        // Document titles come from the server payload; keep what we have.
        document_title: previousById.get(row.id)?.document_title ?? null,
        is_new: isNew,
        attendees: attendeesByEvent.get(row.id) ?? [],
      };
    });

    // A quiet heads-up when a brand-new event from someone else arrives.
    const arrived = next.filter((e) => e.is_new && !previousById.has(e.id));
    if (arrived.length === 1) {
      toast.info(`Neuer Termin von deiner Familie: „${arrived[0].title}“`);
    } else if (arrived.length > 1) {
      toast.info(`${arrived.length} neue Termine von deiner Familie`);
    }

    setEvents(sortEvents(next));
  }, [familyId, currentUserId, memberNames, supabase]);

  useMountEffect(() => {
    if (!familyId) return;
    // Defensive: test mocks (and any non-realtime client) don't implement
    // channel(); the page then simply stays request/response.
    if (typeof supabase.channel !== "function") return;

    const channel = supabase
      .channel(`calendar-events-${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calendar_events",
          filter: `family_id=eq.${familyId}`,
        },
        () => void refreshEvents(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calendar_events",
          filter: `family_id=eq.${familyId}`,
        },
        () => void refreshEvents(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  });

  // Seeing is acknowledging: once the user has a "Neu" event in front of
  // them — the day list on load, a tapped day, or an opened event — record
  // it as seen. The badge stays for this session (so it can be noticed)
  // and is gone on the next visit. Event-handler based on purpose: no
  // reactive effect, seen state only changes on user-visible moments.
  const recordedSeenRef = useRef<Set<string>>(new Set());
  const markEventsSeen = useCallback(
    (shown: CalendarEvent[]) => {
      if (!currentUserId) return;
      const unrecorded = shown.filter(
        (event) => event.is_new && !recordedSeenRef.current.has(event.id),
      );
      if (unrecorded.length === 0) return;
      for (const event of unrecorded) recordedSeenRef.current.add(event.id);
      void supabase.from("calendar_event_seen").upsert(
        unrecorded.map((event) => ({
          event_id: event.id,
          user_id: currentUserId,
        })),
        { onConflict: "event_id,user_id", ignoreDuplicates: true },
      );
    },
    [currentUserId, supabase],
  );

  // The initially selected day (today) is on screen right away.
  useMountEffect(() => {
    markEventsSeen(eventsForDay(initialEvents, selectedDate));
  });

  /** Day tap: select it and acknowledge its visible events. */
  const selectDay = useCallback(
    (day: Date) => {
      setSelectedDate(day);
      markEventsSeen(eventsForDay(filteredEvents, day));
    },
    [filteredEvents, markEventsSeen],
  );

  /** "Heute" anchor: jump both views and the day list back to now. */
  const goToToday = useCallback(() => {
    const now = new Date();
    setActiveMonth(monthStart(now));
    selectDay(now);
  }, [selectDay]);

  const shiftWeek = useCallback(
    (amount: number) => {
      const next = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate() + amount * 7,
      );
      setActiveMonth(monthStart(next));
      selectDay(next);
    },
    [selectedDate, selectDay],
  );

  const isTodayInView =
    isSameCalendarDay(selectedDate, today) &&
    (view === "week" || isSameCalendarMonth(activeMonth, today));

  // The page header's "Termin" button opens this view's create sheet via
  // the planner actions context (registered on mount, cleared on unmount).
  const plannerActions = usePlannerActionsOptional();
  useMountEffect(() => {
    if (!familyId) return;
    plannerActions?.setCreateHandler(openCreate);
    return () => plannerActions?.setCreateHandler(null);
  });

  const openEdit = useCallback(
    (event: CalendarEvent) => {
      // Opening an event is the clearest form of having seen it.
      markEventsSeen([event]);
      setEditingEvent(event);
      setSuggestionTemplate(null);
      setSheetOpen(true);
    },
    [markEventsSeen],
  );

  /** Remember a handled suggestion so it never comes back. */
  const recordDismissal = useCallback(
    async (entityId: string) => {
      if (!familyId) return false;
      const { error } = await supabase
        .from("calendar_suggestion_dismissals")
        .insert({ family_id: familyId, entity_id: entityId });
      return !error;
    },
    [familyId, supabase],
  );

  const acceptSuggestion = useCallback((suggestion: CalendarSuggestion) => {
    setEditingEvent(null);
    setSuggestionTemplate(suggestion);
    setSheetOpen(true);
  }, []);

  const hideSuggestion = useCallback(
    async (suggestion: CalendarSuggestion) => {
      const ok = await recordDismissal(suggestion.entityId);
      if (!ok) {
        toast.error("Ausblenden hat nicht geklappt.");
        return;
      }
      setSuggestions((current) =>
        current.filter((s) => s.entityId !== suggestion.entityId),
      );
    },
    [recordDismissal],
  );

  /** Show the day an event lives on after it was created or edited. */
  const revealEvent = useCallback((event: CalendarEvent) => {
    const date = new Date(`${event.starts_on}T12:00:00`);
    setSelectedDate(date);
    setActiveMonth(monthStart(date));
  }, []);

  const handleSaved = useCallback(
    (saved: CalendarEvent, mode: "created" | "updated") => {
      setEvents((current) =>
        mode === "created"
          ? sortEvents([...current, saved])
          : sortEvents(
              current.map((event) => (event.id === saved.id ? saved : event)),
            ),
      );
      // A save from a suggestion resolves it: dismiss the source entity so
      // the card disappears for good.
      if (mode === "created" && suggestionTemplate) {
        const entityId = suggestionTemplate.entityId;
        setSuggestions((current) =>
          current.filter((s) => s.entityId !== entityId),
        );
        setSuggestionTemplate(null);
        void recordDismissal(entityId);
      }
      if (mode === "created" && currentUserId) {
        void recordProductEvent(supabase, {
          userId: currentUserId,
          familyId,
          eventName: "calendar_event_created",
        });
      }
      revealEvent(saved);
      toast.success(mode === "created" ? "Termin eingetragen" : "Gespeichert");
    },
    [currentUserId, familyId, recordDismissal, revealEvent, suggestionTemplate, supabase],
  );

  const handleEventCreatedByVoice = useCallback(
    (event: CalendarEvent) => {
      setEvents((current) => sortEvents([...current, event]));
      revealEvent(event);
    },
    [revealEvent],
  );

  const handleDeleteRequest = useCallback((event: CalendarEvent) => {
    setSheetOpen(false);
    setDeleteTarget(event);
  }, []);

  /**
   * Delete either the whole series or — for recurring events — just the
   * occurrence on the currently selected day (stored as an exception date,
   * so the rest of the series stays intact).
   */
  const handleDelete = useCallback(
    async (scope: "single" | "series") => {
      if (!deleteTarget) return;
      setDeleting(true);
      try {
        if (scope === "single") {
          const date = toCalendarDate(selectedDate);
          const exceptions = [...deleteTarget.recurrence_exceptions, date];
          const { error } = await supabase
            .from("calendar_events")
            .update({ recurrence_exceptions: exceptions })
            .eq("id", deleteTarget.id);

          if (error) {
            toast.error("Löschen hat nicht geklappt.");
            return;
          }
          setEvents((current) =>
            current.map((event) =>
              event.id === deleteTarget.id
                ? { ...event, recurrence_exceptions: exceptions }
                : event,
            ),
          );
          toast.success("Tag aus der Serie entfernt");
        } else {
          const { error } = await supabase
            .from("calendar_events")
            .delete()
            .eq("id", deleteTarget.id);

          if (error) {
            toast.error("Löschen hat nicht geklappt.");
            return;
          }
          setEvents((current) =>
            current.filter((event) => event.id !== deleteTarget.id),
          );
          toast.success("Termin gelöscht");
        }
        setDeleteTarget(null);
      } catch {
        toast.error("Etwas ist schiefgelaufen.");
      } finally {
        setDeleting(false);
      }
    },
    [deleteTarget, selectedDate, supabase],
  );

  return (
    <div className="space-y-5">
      <section
        className="rounded-ordilo-md border border-border bg-card p-3 shadow-card sm:p-4"
        aria-label="Kalender"
        data-testid="family-calendar"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {members.length > 1 ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Nach Person filtern"
              data-testid="calendar-member-filter"
            >
              <button
                type="button"
                onClick={() => setMemberFilter(null)}
                aria-pressed={memberFilter === null}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  memberFilter === null
                    ? "border-foreground/70 bg-foreground text-background"
                    : "border-border bg-card text-foreground",
                )}
              >
                Alle
              </button>
              {members.map((member) => {
                const selected = memberFilter === member.id;
                const color = memberColors.get(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() =>
                      setMemberFilter((current) =>
                        current === member.id ? null : member.id,
                      )
                    }
                    aria-pressed={selected}
                    aria-label={`Nur Termine von ${member.name}`}
                    title={member.name}
                    data-testid={`calendar-filter-${member.id}`}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      selected ? "scale-105 text-white shadow-sm" : "bg-card",
                    )}
                    style={
                      selected
                        ? { backgroundColor: color, borderColor: color }
                        : { borderColor: color, color }
                    }
                  >
                    {initialOf(member.name)}
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}

          <div
            className="grid shrink-0 grid-cols-2 rounded-ordilo-sm bg-secondary p-1 text-xs"
            role="group"
            aria-label="Ansicht wechseln"
          >
            {([
              ["week", "Woche"],
              ["month", "Monat"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                className={cn(
                  "rounded-[8px] px-3 py-1.5 font-medium",
                  view === value && "bg-card text-foreground shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() =>
              view === "month"
                ? setActiveMonth((current) => shiftMonth(current, -1))
                : shiftWeek(-1)
            }
            aria-label={view === "month" ? "Vorheriger Monat" : "Vorherige Woche"}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 items-center justify-center gap-2">
            <h2 className="truncate text-base font-semibold capitalize text-foreground">
              {view === "month" ? monthTitle : weekTitle(weekDays(selectedDate))}
            </h2>
            {!isTodayInView && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 rounded-full px-2.5 text-xs"
                onClick={goToToday}
                data-testid="calendar-today-button"
              >
                Heute
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() =>
              view === "month"
                ? setActiveMonth((current) => shiftMonth(current, 1))
                : shiftWeek(1)
            }
            aria-label={view === "month" ? "Nächster Monat" : "Nächste Woche"}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {view === "week" ? (
          <div
            className="divide-y divide-border/70"
            data-testid="calendar-week-agenda"
          >
            {weekDays(selectedDate).map((day) => {
              const dayEvents = sortDayEvents(eventsForDay(filteredEvents, day));
              const isToday = isSameCalendarDay(day, today);
              const isSelected = isSameCalendarDay(day, selectedDate);
              return (
                <div
                  key={toCalendarDate(day)}
                  className={cn("flex gap-2 py-1.5", isSelected && "bg-secondary/40")}
                >
                  <button
                    type="button"
                    onClick={() => selectDay(day)}
                    aria-label={`${formatGermanDate(toCalendarDate(day))} auswählen`}
                    aria-pressed={isSelected}
                    className="flex w-11 shrink-0 flex-col items-center rounded-ordilo-sm py-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">
                      {day.toLocaleDateString("de-DE", { weekday: "short" })}
                    </span>
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-sm font-medium",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 space-y-1 py-0.5">
                    {dayEvents.length > 0 ? (
                      dayEvents.map((event) => {
                        const color = eventColor(event);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => openEdit(event)}
                            className="flex w-full items-baseline gap-2 rounded-ordilo-sm border-l-[3px] border-transparent bg-secondary/60 px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            style={color ? { borderLeftColor: color } : undefined}
                            data-testid={`week-event-${event.id}`}
                          >
                            <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                              {event.all_day || !event.starts_time
                                ? "ganztags"
                                : event.starts_time.slice(0, 5)}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {event.title}
                              {event.is_new && (
                                <span
                                  className="ml-1.5 inline-block size-1.5 rounded-full bg-[var(--apricot,#E46018)] align-middle"
                                  aria-label="Neu"
                                />
                              )}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          selectDay(day);
                          openCreate();
                        }}
                        aria-label={`Termin am ${formatGermanDate(toCalendarDate(day))} eintragen`}
                        className="flex h-8 w-full items-center gap-1.5 rounded-ordilo-sm px-2 text-xs text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <Plus className="size-3" aria-hidden="true" />
                        Eintragen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((weekday) => (
            <span
              key={weekday}
              className="py-1 text-[11px] font-medium text-muted-foreground"
            >
              {weekday}
            </span>
          ))}

          {days.map((day) => {
            const dayEvents = eventsForDay(filteredEvents, day);
            const isCurrentMonth = isSameCalendarMonth(day, activeMonth);
            const isSelected = isSameCalendarDay(day, selectedDate);
            const isToday = isSameCalendarDay(day, today);

            return (
              <button
                key={toCalendarDate(day)}
                type="button"
                onClick={() => selectDay(day)}
                className={cn(
                  "relative flex min-h-11 flex-col items-center rounded-ordilo-sm px-1 py-1 text-xs transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-16 sm:items-start sm:p-2",
                  !isCurrentMonth && "text-muted-foreground/45",
                  isCurrentMonth && "text-foreground hover:bg-secondary",
                  isSelected && "bg-secondary font-medium",
                )}
                aria-label={`${formatGermanDate(toCalendarDate(day))}${dayEvents.length ? `, ${dayEvents.length} Termin${dayEvents.length === 1 ? "" : "e"}` : ""}`}
                aria-pressed={isSelected}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="mt-auto hidden w-full truncate text-left text-[10px] font-medium text-primary sm:block">
                    {dayEvents[0].title}
                    {dayEvents.length > 1 && ` +${dayEvents.length - 1}`}
                  </span>
                )}
                {dayEvents.length > 0 && (
                  <span
                    className="mt-auto flex items-center gap-0.5 sm:hidden"
                    aria-hidden="true"
                  >
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className="size-1.5 rounded-full bg-primary"
                        style={
                          eventColor(event)
                            ? { backgroundColor: eventColor(event)! }
                            : undefined
                        }
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </>
        )}
      </section>

      <section aria-live="polite" data-testid="calendar-day-events">
        <div className="mb-2 flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
            {dayHeading(selectedDate)}
          </h2>
          {memberFilter && (
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              nur {memberNames.get(memberFilter) ?? "…"}
            </span>
          )}
        </div>

        {selectedEvents.length > 0 ? (
          <div className="space-y-2">
            {selectedEvents.map((event) => {
              const color = eventColor(event);
              const responsibleName = event.responsible_member_id
                ? memberNames.get(event.responsible_member_id)
                : null;
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openEdit(event)}
                  className="block w-full rounded-ordilo-sm border border-border border-l-[3px] bg-card px-3 py-2.5 text-left shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  style={color ? { borderLeftColor: color } : undefined}
                  data-testid={`calendar-event-${event.id}`}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {event.title}
                    {event.is_new && (
                      <span
                        className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                        data-testid={`calendar-event-new-${event.id}`}
                      >
                        Neu
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {event.starts_on !== event.ends_on && (
                      <span>
                        {formatGermanDate(event.starts_on)} bis{" "}
                        {formatGermanDate(event.ends_on)}
                      </span>
                    )}
                    {!event.all_day && event.starts_time && (
                      <span>
                        {event.starts_time.slice(0, 5)}
                        {event.ends_time && ` bis ${event.ends_time.slice(0, 5)}`} Uhr
                      </span>
                    )}
                    {event.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden="true" />
                        {event.location}
                      </span>
                    )}
                    {event.recurrence !== "none" && (
                      <span className="inline-flex items-center gap-1">
                        <Repeat className="size-3" aria-hidden="true" />
                        {RECURRENCE_LABELS[event.recurrence]}
                      </span>
                    )}
                    {responsibleName && (
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="size-3" aria-hidden="true" />
                        {responsibleName} kümmert sich
                      </span>
                    )}
                    {event.attendees.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" aria-hidden="true" />
                        {event.attendees.map((a) => a.name).join(", ")}
                      </span>
                    )}
                  </p>
                  {event.note && (
                    <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>
                  )}
                  {event.document_id && (
                    <span
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                      data-testid={`calendar-event-document-${event.id}`}
                    >
                      <FileText className="size-3" aria-hidden="true" />
                      {event.document_title ?? "Aus einem Dokument"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-ordilo-sm bg-secondary/60 px-3 py-3">
            <p className="text-sm text-muted-foreground">
              {memberFilter
                ? `Für ${memberNames.get(memberFilter) ?? "diese Person"} steht hier nichts an.`
                : "Noch nichts geplant an diesem Tag."}
            </p>
            {familyId && !memberFilter && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openCreate}
                data-testid="calendar-empty-day-create"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Termin am {formatGermanDate(toCalendarDate(selectedDate))} eintragen
              </Button>
            )}
          </div>
        )}
      </section>

      {familyId && (
        <VoicePlannerCard
          familyId={familyId}
          members={members}
          onEventCreated={handleEventCreatedByVoice}
        />
      )}

      {familyId && suggestions.length > 0 && (
        <section
          aria-label="Terminvorschläge aus Dokumenten"
          data-testid="calendar-suggestions"
        >
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              Aus euren Dokumenten
            </h2>
          </div>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.entityId}
                className="rounded-ordilo-sm border border-border bg-card px-3 py-2.5 shadow-card"
                data-testid={`calendar-suggestion-${suggestion.entityId}`}
              >
                <p className="text-sm font-medium text-foreground">
                  {suggestion.label ?? suggestion.documentTitle ?? "Termin"}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{formatGermanDate(suggestion.date)}</span>
                  {suggestion.documentTitle && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <FileText className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{suggestion.documentTitle}</span>
                    </span>
                  )}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => acceptSuggestion(suggestion)}
                    data-testid={`suggestion-accept-${suggestion.entityId}`}
                  >
                    <CalendarPlus className="size-3.5" aria-hidden="true" />
                    Eintragen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-muted-foreground"
                    onClick={() => void hideSuggestion(suggestion)}
                    data-testid={`suggestion-dismiss-${suggestion.entityId}`}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    Ausblenden
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {familyId && (
        <EventSheet
          key={
            editingEvent
              ? `edit-${editingEvent.id}`
              : suggestionTemplate
                ? `suggest-${suggestionTemplate.entityId}`
                : "create"
          }
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setSuggestionTemplate(null);
          }}
          familyId={familyId}
          members={members}
          event={editingEvent}
          existingEvents={events}
          defaultDate={toCalendarDate(selectedDate)}
          template={
            suggestionTemplate
              ? ({
                  title:
                    suggestionTemplate.label ??
                    suggestionTemplate.documentTitle ??
                    "",
                  starts_on: suggestionTemplate.date,
                  ends_on: suggestionTemplate.date,
                  document_id: suggestionTemplate.documentId,
                  document_title: suggestionTemplate.documentTitle,
                } satisfies EventTemplate)
              : null
          }
          onSaved={handleSaved}
          onDeleteRequest={handleDeleteRequest}
        />
      )}

      <Sheet
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <SheetContent side="bottom" data-testid="event-delete-confirm-sheet">
          <SheetHeader>
            <SheetTitle>Termin löschen?</SheetTitle>
            <SheetDescription>
              {deleteTarget?.recurrence === "none"
                ? "Der Termin wird für die ganze Familie entfernt."
                : "Der Termin wiederholt sich. Was möchtest du löschen?"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            {deleteTarget && deleteTarget.recurrence !== "none" && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleDelete("single")}
                  disabled={deleting}
                  data-testid="confirm-delete-single-button"
                >
                  Nur {formatGermanDate(toCalendarDate(selectedDate))} löschen
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => void handleDelete("series")}
                  disabled={deleting}
                  data-testid="confirm-delete-series-button"
                >
                  Ganze Serie löschen
                </Button>
              </>
            )}
            {deleteTarget?.recurrence === "none" && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => void handleDelete("series")}
                disabled={deleting}
                data-testid="confirm-delete-event-button"
              >
                Löschen
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Abbrechen
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
