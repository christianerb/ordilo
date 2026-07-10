"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Check,
  Trash2,
  RotateCcw,
  Loader2,
  Calendar,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatGermanDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskCardData } from "@/components/ordilo/task-card";
import { useDocumentViewer } from "@/lib/scan/scan-context";
import { TagInput } from "@/components/ordilo/tag-input";

// ---------------------------------------------------------------------------
// Priority config — compact, color-dotted
// ---------------------------------------------------------------------------

const PRIORITIES: {
  value: string;
  label: string;
  dot: string;
}[] = [
  { value: "high", label: "Hoch", dot: "bg-[var(--warm-apricot)]" },
  { value: "medium", label: "Mittel", dot: "bg-[var(--petrol)]" },
  { value: "low", label: "Niedrig", dot: "bg-[var(--mist)]" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TaskDetailSheetProps {
  task: TaskCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onToggleDone: (taskId: string, newStatus: string) => void;
  onDismiss: (taskId: string) => void;
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  onSaved,
  onToggleDone,
  onDismiss,
}: TaskDetailSheetProps) {
  const supabase = createClient();
  const { openDocument } = useDocumentViewer();
  // Form state is initialized from the task prop on mount. The parent
  // uses a key prop (Rule 5: reset with key) to force a clean remount
  // when a different task is selected, so these initializers pick up the
  // new task's values without a useEffect sync.
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = task?.status === "done";
  const isOpen = task?.status === "open";
  const isDismissed = task?.status === "dismissed";
  const hasDocument = Boolean(task?.document_id);
  const linkedDocs = task?.linked_documents ?? [];
  const createdDate = task ? formatGermanDate(task.created_at) : null;

  const hasChanges =
    task &&
    (title !== task.title ||
      description !== (task.description ?? "") ||
      dueDate !== (task.due_date ?? "") ||
      priority !== task.priority ||
      JSON.stringify(tags) !== JSON.stringify(task.tags ?? []));

  const handleSave = useCallback(async () => {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          title: title.trim() || task.title,
          description: description.trim() || null,
          due_date: dueDate || null,
          priority,
          tags,
        })
        .eq("id", task.id);

      if (updateError) {
        setError("Speichern hat nicht geklappt.");
        setSaving(false);
        return;
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Etwas ist schiefgelaufen.");
    } finally {
      setSaving(false);
    }
  }, [task, title, description, dueDate, priority, tags, supabase, onSaved, onOpenChange]);

  const handleToggle = useCallback(() => {
    if (!task) return;
    onToggleDone(task.id, isDone ? "open" : "done");
  }, [task, isDone, onToggleDone]);

  const handleDismiss = useCallback(() => {
    if (!task) return;
    onDismiss(task.id);
    onOpenChange(false);
  }, [task, onDismiss, onOpenChange]);

  const allDocs = [
    ...(hasDocument && task
      ? [{ id: task.document_id!, title: task.document_title ?? null, primary: true }]
      : []),
    ...linkedDocs.map((d) => ({ id: d.id, title: d.title, primary: false })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 sm:max-w-md"
        data-testid="task-detail-sheet"
      >
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="pr-6 text-sm font-medium text-muted-foreground">
            Aufgabendetails
          </SheetTitle>
          <SheetDescription className="sr-only">
            Details und Einstellungen für diese Aufgabe
          </SheetDescription>
        </SheetHeader>

        {task && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* ── Status row — tiny dot + date ──────────────────── */}
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    isDone
                      ? "bg-[var(--petrol)]"
                      : isOpen
                        ? "bg-[var(--warm-apricot)]"
                        : "bg-[var(--mist)]",
                  )}
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground">
                  {isDone ? "Erledigt" : isOpen ? "Offen" : "Verworfen"}
                </span>
                {createdDate && (
                  <>
                    <span className="text-xs text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground/60">
                      {createdDate}
                    </span>
                  </>
                )}
                {task.confidence > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground/60">
                      {Math.round(task.confidence * 100)}% KI
                    </span>
                  </>
                )}
              </div>

              {/* Error */}
              {error && (
                <div
                  className="mb-3 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* ── Title — the hero ──────────────────────────────── */}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Aufgabentitel"
                className="w-full border-0 bg-transparent text-lg font-semibold text-foreground outline-none focus:ring-0"
                data-testid="task-detail-title"
              />

              {/* ── Description ────────────────────────────────────── */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notizen, Details, was zu tun ist…"
                rows={3}
                className="mt-3 w-full resize-none rounded-ordilo-sm border-0 bg-secondary/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:bg-secondary/80 focus:ring-0"
                data-testid="task-detail-description"
              />

              {/* ── Meta row — due date + priority ─────────────────── */}
              <div className="mt-3 flex items-center gap-3">
                {/* Due date — inline, compact */}
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
                    data-testid="task-detail-due-date"
                  />
                </div>

                {/* Priority — dot picker */}
                <div
                  className="flex items-center gap-1.5"
                  role="radiogroup"
                  aria-label="Priorität"
                  data-testid="task-detail-priority"
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
                      data-testid={`task-detail-priority-${p.value}`}
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

              {/* ── Tags ───────────────────────────────────────────── */}
              <div className="mt-4" data-testid="task-detail-tags-section">
                <TagInput
                  value={tags}
                  onChange={setTags}
                  testId="task-detail-tag"
                  disabled={saving}
                  variant="minimal"
                />
              </div>

              {/* ── Linked documents — compact rows ────────────────── */}
              {allDocs.length > 0 && (
                <div className="mt-4" data-testid="task-detail-documents">
                  <p className="mb-2 text-xs text-muted-foreground/50">
                    Verlinkte Dokumente
                  </p>
                  <div className="space-y-1">
                    {allDocs.map((doc) => (
                      <Link
                        key={doc.id}
                        href={`/dokumente?doc=${doc.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onOpenChange(false);
                          void openDocument(doc.id);
                        }}
                        className="flex items-center gap-2.5 rounded-ordilo-sm px-2 py-1.5 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        data-testid="task-detail-document-link"
                      >
                        <FileText
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                          strokeWidth={1.5}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {doc.title?.trim() || "Ohne Titel"}
                        </span>
                        {doc.primary && (
                          <span className="shrink-0 text-[10px] text-muted-foreground/40">
                            Hauptdokument
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Action bar — compact ────────────────────────────── */}
            <div className="border-t border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                {/* Toggle — primary */}
                <Button
                  type="button"
                  variant={isDone ? "outline" : "default"}
                  size="sm"
                  onClick={handleToggle}
                  disabled={isDismissed}
                  className="flex-1"
                  data-testid="task-detail-toggle"
                >
                  {isDone ? (
                    <>
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Wieder öffnen
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      Erledigt
                    </>
                  )}
                </Button>

                {/* Save */}
                {hasChanges && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1"
                    data-testid="task-detail-save"
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      "Speichern"
                    )}
                  </Button>
                )}

                {/* Dismiss — ghost, only for open */}
                {isOpen && !hasChanges && (
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="shrink-0 rounded-ordilo-sm p-2 text-muted-foreground/50 transition-colors hover:bg-destructive/5 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label="Aufgabe verwerfen"
                    data-testid="task-detail-dismiss"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
