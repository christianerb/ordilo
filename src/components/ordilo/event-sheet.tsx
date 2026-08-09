"use client";

import { useCallback, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CalendarEvent } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AssigneeOption } from "@/components/ordilo/task-card";

const RECURRENCE_OPTIONS: {
  value: CalendarEvent["recurrence"];
  label: string;
}[] = [
  { value: "none", label: "Keine" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "biweekly", label: "Alle 14 Tage" },
  { value: "monthly", label: "Monatlich" },
  { value: "yearly", label: "Jährlich" },
];

/**
 * Prefill for a new event, e.g. from a document-extracted date suggestion.
 * Only used in create mode; carries the source document so the saved event
 * stays linked to it.
 */
export interface EventTemplate {
  title?: string;
  starts_on?: string;
  ends_on?: string;
  document_id?: string | null;
  document_title?: string | null;
}

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Postgres returns `HH:MM:SS`; input[type=time] wants `HH:MM`. */
function toTimeInput(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

export interface EventSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: string;
  members: AssigneeOption[];
  /** The event being edited, or null to create a new one. */
  event: CalendarEvent | null;
  /** Pre-selected date for new events (the day the user tapped). */
  defaultDate: string;
  /** Create mode only: prefill from a planner suggestion. */
  template?: EventTemplate | null;
  /** Called after a successful save with the saved event. */
  onSaved: (event: CalendarEvent, mode: "created" | "updated") => void;
  /** Edit mode only: opens the parent's delete confirmation. */
  onDeleteRequest?: (event: CalendarEvent) => void;
}

/**
 * Shared create/edit form for calendar events — one sheet, all fields:
 * title, date range, optional times, recurrence, attendees, note.
 *
 * State resets two ways: the parent keys the sheet by event id (switching
 * between create and edit remounts with fresh initializers), and closing
 * the sheet resets the form back to its initial values.
 */
export function EventSheet({
  open,
  onOpenChange,
  familyId,
  members,
  event,
  defaultDate,
  template,
  onSaved,
  onDeleteRequest,
}: EventSheetProps) {
  const supabase = createClient();
  const isEdit = event !== null;

  const [title, setTitle] = useState(event?.title ?? template?.title ?? "");
  const [note, setNote] = useState(event?.note ?? "");
  const [startsOn, setStartsOn] = useState(
    event?.starts_on ?? template?.starts_on ?? defaultDate,
  );
  const [endsOn, setEndsOn] = useState(
    event?.ends_on ?? template?.ends_on ?? template?.starts_on ?? defaultDate,
  );
  const [allDay, setAllDay] = useState(event?.all_day ?? true);
  const [startsTime, setStartsTime] = useState(toTimeInput(event?.starts_time));
  const [endsTime, setEndsTime] = useState(toTimeInput(event?.ends_time));
  const [recurrence, setRecurrence] = useState<CalendarEvent["recurrence"]>(
    event?.recurrence ?? "none",
  );
  const [recurrenceUntil, setRecurrenceUntil] = useState(
    event?.recurrence_until ?? "",
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [responsibleId, setResponsibleId] = useState(
    event?.responsible_member_id ?? "",
  );
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    event?.attendees.map((a) => a.id) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle(event?.title ?? template?.title ?? "");
    setNote(event?.note ?? "");
    setStartsOn(event?.starts_on ?? template?.starts_on ?? defaultDate);
    setEndsOn(
      event?.ends_on ?? template?.ends_on ?? template?.starts_on ?? defaultDate,
    );
    setAllDay(event?.all_day ?? true);
    setStartsTime(toTimeInput(event?.starts_time));
    setEndsTime(toTimeInput(event?.ends_time));
    setRecurrence(event?.recurrence ?? "none");
    setRecurrenceUntil(event?.recurrence_until ?? "");
    setLocation(event?.location ?? "");
    setResponsibleId(event?.responsible_member_id ?? "");
    setAttendeeIds(event?.attendees.map((a) => a.id) ?? []);
    setFormError(null);
  }, [event, template, defaultDate]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  const toggleAttendee = useCallback((memberId: string) => {
    setAttendeeIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }, []);

  const validate = useCallback((): string | null => {
    if (!title.trim()) return "Bitte gib einen Namen ein.";
    if (endsOn < startsOn) {
      return "Das Ende darf nicht vor dem Anfang liegen.";
    }
    if (!allDay) {
      if (!TIME_PATTERN.test(startsTime) || !TIME_PATTERN.test(endsTime)) {
        return "Bitte gib Beginn und Ende der Uhrzeit an.";
      }
      if (startsOn === endsOn && endsTime <= startsTime) {
        return "Das Ende der Uhrzeit muss nach dem Beginn liegen.";
      }
    }
    if (recurrence !== "none" && recurrenceUntil && recurrenceUntil < startsOn) {
      return "Das Ende der Wiederholung darf nicht vor dem Anfang liegen.";
    }
    return null;
  }, [allDay, endsOn, endsTime, recurrence, recurrenceUntil, startsOn, startsTime, title]);

  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }

    setSaving(true);
    setFormError(null);

    const row = {
      title: title.trim(),
      note: note.trim() || null,
      starts_on: startsOn,
      ends_on: endsOn,
      all_day: allDay,
      starts_time: allDay ? null : startsTime,
      ends_time: allDay ? null : endsTime,
      recurrence,
      recurrence_until: recurrence === "none" ? null : recurrenceUntil || null,
      location: location.trim() || null,
      responsible_member_id: responsibleId || null,
    };
    const attendees = members
      .filter((member) => attendeeIds.includes(member.id))
      .map((member) => ({ id: member.id, name: member.name }));

    try {
      if (isEdit) {
        const { error: updateError } = await supabase
          .from("calendar_events")
          .update(row)
          .eq("id", event.id);

        if (updateError) {
          setFormError("Speichern hat nicht geklappt.");
          return;
        }

        // Diff attendees: remove unchecked, insert newly checked.
        const before = new Set(event.attendees.map((a) => a.id));
        const after = new Set(attendeeIds);
        const toRemove = [...before].filter((id) => !after.has(id));
        const toAdd = [...after].filter((id) => !before.has(id));

        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from("calendar_event_attendees")
            .delete()
            .eq("event_id", event.id)
            .in("family_member_id", toRemove);
          if (removeError) {
            setFormError(
              "Die Teilnehmer konnten nicht gespeichert werden. Bitte versuch es nochmal.",
            );
            return;
          }
        }
        if (toAdd.length > 0) {
          const { error: addError } = await supabase
            .from("calendar_event_attendees")
            .insert(
              toAdd.map((memberId) => ({
                event_id: event.id,
                family_member_id: memberId,
              })),
            );
          if (addError) {
            setFormError(
              "Die Teilnehmer konnten nicht gespeichert werden. Bitte versuch es nochmal.",
            );
            return;
          }
        }

        onSaved(
          { ...event, ...row, attendees },
          "updated",
        );
      } else {
        const { data, error: insertError } = await supabase
          .from("calendar_events")
          .insert({
            ...row,
            family_id: familyId,
            recurrence_exceptions: [],
            document_id: template?.document_id ?? null,
          })
          .select(
            "id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id, document_id",
          )
          .single();

        if (insertError || !data) {
          setFormError("Speichern hat nicht geklappt.");
          return;
        }

        if (attendeeIds.length > 0) {
          const { error: attendeesError } = await supabase
            .from("calendar_event_attendees")
            .insert(
              attendeeIds.map((memberId) => ({
                event_id: data.id,
                family_member_id: memberId,
              })),
            );
          if (attendeesError) {
            // Roll back the event so a retry cannot create a duplicate.
            await supabase
              .from("calendar_events")
              .delete()
              .eq("id", data.id);
            setFormError("Speichern hat nicht geklappt.");
            return;
          }
        }

        onSaved(
          {
            ...(data as Omit<CalendarEvent, "attendees">),
            document_title: template?.document_title ?? null,
            attendees,
          },
          "created",
        );
      }
      handleOpenChange(false);
    } catch {
      setFormError("Etwas ist schiefgelaufen.");
    } finally {
      setSaving(false);
    }
  }, [
    validate,
    title,
    note,
    startsOn,
    endsOn,
    allDay,
    startsTime,
    endsTime,
    recurrence,
    recurrenceUntil,
    location,
    responsibleId,
    members,
    attendeeIds,
    isEdit,
    event,
    template,
    supabase,
    familyId,
    onSaved,
    handleOpenChange,
  ]);

  const inputClass =
    "h-10 w-full rounded-ordilo-base border border-border bg-transparent px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-ring/50";
  const labelClass = "mb-1.5 block text-sm font-medium";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{isEdit ? "Termin bearbeiten" : "Neuer Termin"}</SheetTitle>
          <SheetDescription>
            Alle in deiner Familie können diesen Termin sehen.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {formError && (
            <div
              className="rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="event-title" className={labelClass}>
              Was ist geplant?
            </label>
            <input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Zum Beispiel: Herbstferien"
              autoFocus
              maxLength={160}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="event-start" className={labelClass}>
                Von
              </label>
              <input
                id="event-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="event-end" className={labelClass}>
                Bis
              </label>
              <input
                id="event-end"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-4 accent-[var(--petrol)]"
            />
            Ganztägig
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-starts-time" className={labelClass}>
                  Beginn
                </label>
                <input
                  id="event-starts-time"
                  type="time"
                  value={startsTime}
                  onChange={(e) => setStartsTime(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="event-ends-time" className={labelClass}>
                  Ende
                </label>
                <input
                  id="event-ends-time"
                  type="time"
                  value={endsTime}
                  onChange={(e) => setEndsTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="event-location" className={labelClass}>
              Ort{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Zum Beispiel: Turnhalle Grundschule"
              maxLength={200}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="event-recurrence" className={labelClass}>
              Wiederholung
            </label>
            <select
              id="event-recurrence"
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as CalendarEvent["recurrence"])
              }
              className={cn(inputClass, "bg-card")}
            >
              {RECURRENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {recurrence !== "none" && (
            <div>
              <label htmlFor="event-recurrence-until" className={labelClass}>
                Wiederholen bis{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <input
                id="event-recurrence-until"
                type="date"
                value={recurrenceUntil}
                onChange={(e) => setRecurrenceUntil(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {members.length > 0 && (
            <div>
              <span className={labelClass} id="event-attendees-label">
                Wer ist dabei?
              </span>
              <div
                role="group"
                aria-labelledby="event-attendees-label"
                className="flex flex-wrap gap-1.5"
              >
                {members.map((member) => {
                  const selected = attendeeIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleAttendee(member.id)}
                      aria-pressed={selected}
                      data-testid={`event-attendee-chip-${member.id}`}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        selected
                          ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
                          : "border-border bg-card text-foreground hover:border-[var(--petrol)] hover:bg-[var(--petrol)]/5",
                      )}
                    >
                      {selected && (
                        <Check
                          className="size-3.5"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      )}
                      {member.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {members.length > 0 && (
            <div>
              <label htmlFor="event-responsible" className={labelClass}>
                Wer kümmert sich?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <select
                id="event-responsible"
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                className={cn(inputClass, "bg-card")}
                data-testid="event-responsible-select"
              >
                <option value="">Niemand festgelegt</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isEdit && template?.document_title && (
            <p className="rounded-ordilo-sm bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              Aus dem Dokument „{template.document_title}“ übernommen — der
              Termin bleibt damit verknüpft.
            </p>
          )}

          <div>
            <label htmlFor="event-note" className={labelClass}>
              Notiz{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <textarea
              id="event-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Zum Beispiel: Kita ist geschlossen"
              rows={3}
              className="w-full resize-none rounded-ordilo-base border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-ring/50"
            />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            Termin speichern
          </Button>

          {isEdit && onDeleteRequest && (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5 text-destructive hover:bg-destructive/5"
              onClick={() => onDeleteRequest(event)}
              disabled={saving}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Termin löschen
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
