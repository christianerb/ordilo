"use client";

import { useState, useCallback } from "react";
import { Loader2, Calendar, User } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AssigneeOption } from "@/components/ordilo/task-card";

const PRIORITIES: {
  value: string;
  label: string;
  dot: string;
}[] = [
  { value: "high", label: "Hoch", dot: "bg-[var(--warm-apricot)]" },
  { value: "medium", label: "Mittel", dot: "bg-[var(--petrol)]" },
  { value: "low", label: "Niedrig", dot: "bg-[var(--mist)]" },
];

export interface TaskCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: string;
  members: AssigneeOption[];
  onCreated: () => void;
}

export function TaskCreateSheet({
  open,
  onOpenChange,
  familyId,
  members,
  onCreated,
}: TaskCreateSheetProps) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
    setAssignedTo("");
    setError(null);
  }, []);

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

    setSaving(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("tasks").insert({
        family_id: familyId,
        document_id: null,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        priority,
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

      onCreated();
      handleOpenChange(false);
    } catch {
      setError("Etwas ist schiefgelaufen.");
    } finally {
      setSaving(false);
    }
  }, [title, description, dueDate, priority, assignedTo, familyId, supabase, onCreated, handleOpenChange]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        className="w-full gap-0 sm:max-w-md"
        data-testid="task-create-sheet"
      >
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="text-sm font-medium text-muted-foreground">
            Neue Aufgabe
          </SheetTitle>
          <SheetDescription className="sr-only">
            Erstelle eine neue Aufgabe für deine Familie
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {error && (
              <div
                className="mb-3 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Aufgabentitel"
              autoFocus
              className="w-full border-0 bg-transparent text-lg font-semibold text-foreground outline-none focus:ring-0"
              data-testid="task-create-title"
            />

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notizen, Details, was zu tun ist…"
              rows={3}
              className="mt-3 w-full resize-none rounded-ordilo-sm border-0 bg-secondary/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:bg-secondary/80 focus:ring-0"
              data-testid="task-create-description"
            />

            {/* Meta row — due date + priority */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-ordilo-sm bg-secondary/50 px-2.5 py-1.5">
                <Calendar
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="min-w-0 border-0 bg-transparent text-xs text-foreground outline-none focus:ring-0"
                  data-testid="task-create-due-date"
                />
              </div>

              <div
                className="flex items-center gap-1.5"
                role="radiogroup"
                aria-label="Priorität"
                data-testid="task-create-priority"
              >
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={priority === p.value}
                    aria-label={p.label}
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      priority === p.value
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground/60 hover:text-foreground",
                    )}
                    data-testid={`task-create-priority-${p.value}`}
                  >
                    <span
                      className={cn("size-2 rounded-full", p.dot)}
                      aria-hidden="true"
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee picker */}
            {members.length > 0 && (
              <div className="mt-4" data-testid="task-create-assignee-section">
                <p className="mb-2 text-xs text-muted-foreground/50">
                  Verantwortlich
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAssignedTo("")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      !assignedTo
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground/60 hover:text-foreground",
                    )}
                    data-testid="task-create-assignee-none"
                  >
                    <User
                      className="size-3"
                      aria-hidden="true"
                      strokeWidth={1.5}
                    />
                    Niemand
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAssignedTo(m.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        assignedTo === m.id
                          ? "bg-secondary font-medium text-foreground"
                          : "text-muted-foreground/60 hover:text-foreground",
                      )}
                      data-testid={`task-create-assignee-${m.id}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="border-t border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
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
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
