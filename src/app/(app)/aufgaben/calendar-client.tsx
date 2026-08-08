"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Users,
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
import { EventSheet } from "@/components/ordilo/event-sheet";
import type { AssigneeOption } from "@/components/ordilo/task-card";
import {
  calendarDays,
  eventsForDay,
  isSameCalendarDay,
  isSameCalendarMonth,
  monthStart,
  shiftMonth,
  toCalendarDate,
  type CalendarEvent,
} from "@/lib/calendar";
import { formatGermanDate } from "@/lib/format";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { usePlannerActionsOptional } from "./planner-actions-context";
import { VoicePlannerCard } from "./voice-planner";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const RECURRENCE_LABELS: Record<CalendarEvent["recurrence"], string> = {
  none: "",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  yearly: "Jährlich",
};

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

export function CalendarClient({
  initialEvents,
  familyId,
  members,
}: {
  initialEvents: CalendarEvent[];
  familyId: string | null;
  members: AssigneeOption[];
}) {
  const supabase = createClient();
  const today = new Date();
  const [events, setEvents] = useState(initialEvents);
  const [activeMonth, setActiveMonth] = useState(() => monthStart(today));
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [view, setView] = useState<"day" | "three-days" | "week" | "month">("month");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const days = useMemo(() => calendarDays(activeMonth), [activeMonth]);
  const selectedEvents = useMemo(
    () => eventsForDay(events, selectedDate),
    [events, selectedDate],
  );
  const monthTitle = activeMonth.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  const openCreate = useCallback(() => {
    setEditingEvent(null);
    setSheetOpen(true);
  }, []);

  // The page header's "Termin" button opens this view's create sheet via
  // the planner actions context (registered on mount, cleared on unmount).
  const plannerActions = usePlannerActionsOptional();
  useMountEffect(() => {
    if (!familyId) return;
    plannerActions?.setCreateHandler(openCreate);
    return () => plannerActions?.setCreateHandler(null);
  });

  const openEdit = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setSheetOpen(true);
  }, []);

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
      revealEvent(saved);
      toast.success(mode === "created" ? "Termin eingetragen" : "Gespeichert");
    },
    [revealEvent],
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
        <div className="mb-3 grid grid-cols-4 rounded-ordilo-sm bg-secondary p-1 text-xs">
          {([
            ["day", "Tag"],
            ["three-days", "3 Tage"],
            ["week", "Woche"],
            ["month", "Monat"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setView(value)}
              className={cn("rounded-[8px] px-2 py-1.5 font-medium", view === value && "bg-card text-foreground shadow-sm")}>
              {label}
            </button>
          ))}
        </div>
        {view !== "month" ? (
          <div className={cn("grid gap-2", view === "week" ? "grid-cols-7" : view === "three-days" ? "grid-cols-3" : "grid-cols-1")}>
            {Array.from({ length: view === "week" ? 7 : view === "three-days" ? 3 : 1 }, (_, index) => {
              const day = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + index);
              const dayEvents = eventsForDay(events, day);
              return <div key={toCalendarDate(day)} className="min-h-32 rounded-ordilo-sm border border-border p-2">
                <p className="text-xs font-medium">{day.toLocaleDateString("de-DE", { weekday: "short", day: "numeric" })}</p>
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openEdit(event)}
                    className="mt-2 block w-full truncate rounded bg-primary/10 px-1.5 py-1 text-left text-[11px] text-primary"
                  >
                    {event.title}
                  </button>
                ))}
              </div>;
            })}
          </div>
        ) : (
        <>
        <div className="mb-4 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setActiveMonth((current) => shiftMonth(current, -1))}
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <h2 className="text-base font-semibold capitalize text-foreground">
            {monthTitle}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setActiveMonth((current) => shiftMonth(current, 1))}
            aria-label="Nächster Monat"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

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
            const dayEvents = eventsForDay(events, day);
            const isCurrentMonth = isSameCalendarMonth(day, activeMonth);
            const isSelected = isSameCalendarDay(day, selectedDate);
            const isToday = isSameCalendarDay(day, today);

            return (
              <button
                key={toCalendarDate(day)}
                type="button"
                onClick={() => setSelectedDate(day)}
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
                    className="mt-auto size-1.5 rounded-full bg-primary sm:hidden"
                    aria-hidden="true"
                  />
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
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            {formatGermanDate(toCalendarDate(selectedDate))}
          </h2>
        </div>

        {selectedEvents.length > 0 ? (
          <div className="space-y-2">
            {selectedEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => openEdit(event)}
                className="block w-full rounded-ordilo-sm border border-border bg-card px-3 py-2.5 text-left shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid={`calendar-event-${event.id}`}
              >
                <p className="text-sm font-medium text-foreground">{event.title}</p>
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
                  {event.recurrence !== "none" && (
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="size-3" aria-hidden="true" />
                      {RECURRENCE_LABELS[event.recurrence]}
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
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-ordilo-sm bg-secondary/60 px-3 py-3 text-sm text-muted-foreground">
            Noch nichts geplant. Tragt Ferien, Kita-Termine oder andere wichtige
            Tage ein.
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

      {familyId && (
        <EventSheet
          key={editingEvent ? `edit-${editingEvent.id}` : "create"}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          familyId={familyId}
          members={members}
          event={editingEvent}
          defaultDate={toCalendarDate(selectedDate)}
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
