"use client";

import { useState, useCallback } from "react";
import { Loader2, UserX } from "lucide-react";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ordilo/date-input";
import { createClient } from "@/lib/supabase/client";
import { recordProductEvent } from "@/lib/analytics/product-events";
import type { AssigneeOption } from "@/components/ordilo/task-card";
import { MemberAvatar } from "@/components/ordilo/member-avatar";
import { cn } from "@/lib/utils";
import {
  formatTaskDayHint,
  resolveSchedulePreset,
  TASK_SCHEDULE_PRESET_LABELS,
  todayLocalDate,
  type TaskSchedulePreset,
} from "@/lib/task-utils";

function todayAsIsoDate(): string {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

/** The quick "wann?" answers offered above the date field. */
const DUE_PRESETS: TaskSchedulePreset[] = ["today", "tomorrow", "weekend"];

export interface TaskCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: string;
  members: AssigneeOption[];
  /** Signed avatar URLs by member id (photoless members show initials). */
  memberPhotoUrls?: Record<string, string>;
  /**
   * Who the new task starts out belonging to.
   *
   * The list passes the member currently filtered to: looking at Karina's
   * tasks and tapping "+" almost always means "and one more for Karina".
   */
  defaultAssignee?: string | null;
  onCreated: () => void;
}

export function TaskCreateSheet({
  open,
  onOpenChange,
  familyId,
  members,
  memberPhotoUrls = {},
  defaultAssignee = null,
  onCreated,
}: TaskCreateSheetProps) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>(defaultAssignee ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minDueDate = todayAsIsoDate();
  // Read on every render so a sheet left open overnight cannot offer
  // yesterday as "Heute".
  const todayStr = todayLocalDate();

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setAssignedTo(defaultAssignee ?? "");
    setError(null);
  }, [defaultAssignee]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetForm();
      }
      onOpenChange(open);
    },
    [onOpenChange, resetForm],
  );

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (dueDate && dueDate < minDueDate) {
      setError("Bitte wähle heute oder einen späteren Tag.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("tasks").insert({
        family_id: familyId,
        document_id: null,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        status: "open",
        confidence: 1.0,
        confirmed: true,
        tags: [],
        assigned_to: assignedTo || null,
      });

      if (insertError) {
        setError("Speichern hat nicht geklappt.");
        setSaving(false);
        return;
      }

      void Promise.resolve()
        .then(() => supabase.auth.getUser())
        .then(({ data: { user } }) =>
          user
            ? recordProductEvent(supabase, {
                userId: user.id,
                familyId,
                eventName: "task_created",
              })
            : undefined,
        )
        .catch(() => undefined);
      onCreated();
      handleOpenChange(false);
    } catch {
      setError("Etwas ist schiefgelaufen.");
    } finally {
      setSaving(false);
    }
  }, [title, description, dueDate, assignedTo, familyId, supabase, onCreated, handleOpenChange, minDueDate]);

  return (
    <OrdiloDrawer
      variant="detail"
      open={open}
      onOpenChange={handleOpenChange}
      data-testid="task-create-sheet"
    >
      <OrdiloDrawerHeader
        title="Neue Aufgabe"
        description="Erstelle eine neue Aufgabe für deine Familie"
        descriptionHidden
      />

      <OrdiloDrawerBody>
        {error && (
          <div
            className="mb-3 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Creating and editing a task are the same job, so this sheet
            uses the same fields and the same quick answers as the
            detail sheet rather than its own vocabulary. */}
        <div>
          <label
            htmlFor="task-create-title"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Aufgabe
          </label>
          <input
            id="task-create-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Was ist zu tun?"
            autoFocus
            className="w-full rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)] px-3.5 py-3 text-base font-medium leading-snug text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus:border-[var(--petrol)] focus:ring-[3px] focus:ring-ring/20"
            data-testid="task-create-title"
          />
        </div>

        {/* Description */}
        <div className="mt-4">
          <label
            htmlFor="task-create-description"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Notiz
          </label>
          <textarea
            id="task-create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notizen, Details, was zu tun ist…"
            rows={3}
            className="w-full resize-none rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)] px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-[var(--petrol)] focus:ring-[3px] focus:ring-ring/20"
            data-testid="task-create-description"
          />
        </div>

        {/* Due date */}
        <div className="mt-4">
          <label
            htmlFor="task-create-due-date"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Fällig am
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {DUE_PRESETS.map((preset) => {
              const date = resolveSchedulePreset(preset, todayStr);
              const selected = Boolean(date) && dueDate === date;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDueDate(selected ? "" : date ?? "")}
                  aria-pressed={selected}
                  title={formatTaskDayHint(date) ?? undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected
                      ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                      : "border-border bg-[var(--surface-box)] text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`task-create-due-${preset}`}
                >
                  {TASK_SCHEDULE_PRESET_LABELS[preset]}
                </button>
              );
            })}
          </div>
          <DateInput
            id="task-create-due-date"
            value={dueDate}
            onChange={setDueDate}
            minDate={minDueDate}
            className="h-12"
            aria-label="Fällig am"
            data-testid="task-create-due-date"
          />
        </div>

        {/* Assignee — faces, matching the detail sheet and the row */}
        {members.length > 0 && (
          <div className="mt-4" data-testid="task-create-assignee-section">
            <p className="mb-2 text-sm font-medium text-foreground">
              Wer macht das?
            </p>
            <div
              role="radiogroup"
              aria-label="Wer macht das?"
              className="flex flex-wrap gap-2"
            >
              {members.map((member) => {
                const selected = assignedTo === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAssignedTo(member.id)}
                    className={cn(
                      "press-scale inline-flex h-11 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      selected
                        ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                        : "border-border bg-[var(--surface-box)] text-foreground hover:bg-secondary",
                    )}
                    data-testid={`task-create-assignee-${member.id}`}
                  >
                    <MemberAvatar
                      name={member.name}
                      color={member.avatar_color}
                      photoUrl={memberPhotoUrls[member.id]}
                      size="md"
                    />
                    <span className="max-w-28 truncate">{member.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={assignedTo === ""}
                onClick={() => setAssignedTo("")}
                className={cn(
                  "press-scale inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  assignedTo === ""
                    ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
                    : "border-border bg-[var(--surface-box)] text-muted-foreground hover:text-foreground",
                )}
                data-testid="task-create-assignee-none"
              >
                <UserX
                  className="size-4 shrink-0"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                Niemand
              </button>
            </div>
          </div>
        )}
      </OrdiloDrawerBody>

      <OrdiloDrawerFooter>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => handleOpenChange(false)}
          disabled={saving}
        >
          Abbrechen
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          data-testid="task-create-save"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            "Aufgabe erstellen"
          )}
        </Button>
      </OrdiloDrawerFooter>
    </OrdiloDrawer>
  );
}
