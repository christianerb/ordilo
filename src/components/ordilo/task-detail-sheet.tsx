"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  FileText,
  Check,
  Trash2,
  RotateCcw,
  Loader2,
  Calendar,
  User,
  ChevronDown,
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
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
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
  members?: AssigneeOption[];
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  onSaved,
  onToggleDone,
  onDismiss,
  members = [],
}: TaskDetailSheetProps) {
  const supabase = createClient();
  const { openDocument } = useDocumentViewer();
  const sheetTitleRef = useRef<HTMLHeadingElement>(null);
  // Form state is initialized from the task prop on mount. The parent
  // uses a key prop (Rule 5: reset with key) to force a clean remount
  // when a different task is selected, so these initializers pick up the
  // new task's values without a useEffect sync.
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [assignedTo, setAssignedTo] = useState<string>(task?.assigned_to ?? "");
  const [showMore, setShowMore] = useState((task?.tags?.length ?? 0) > 0);
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
      JSON.stringify(tags) !== JSON.stringify(task.tags ?? []) ||
      assignedTo !== (task.assigned_to ?? ""));

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
          assigned_to: assignedTo || null,
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
  }, [task, title, description, dueDate, priority, tags, assignedTo, supabase, onSaved, onOpenChange]);

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
        className="w-full gap-0 bg-[var(--surface-box)] sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          sheetTitleRef.current?.focus();
        }}
        data-testid="task-detail-sheet"
      >
        <SheetHeader className="border-b border-border/60 px-5 py-4 pr-16">
          <div className="flex items-center gap-3">
            <SheetTitle
              ref={sheetTitleRef}
              tabIndex={-1}
              className="text-base font-semibold outline-none"
            >
              Aufgabe
            </SheetTitle>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
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
              {isDone ? "Erledigt" : isOpen ? "Offen" : "Verworfen"}
            </span>
          </div>
          <SheetDescription className="sr-only">
            Aufgabe ansehen und bearbeiten
          </SheetDescription>
        </SheetHeader>

        {task && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <div
                  className="mb-4 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Aufgabentitel"
                aria-label="Aufgabentitel"
                className="w-full border-0 border-b border-transparent bg-transparent px-0 pb-2 text-xl font-semibold leading-snug text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-[var(--petrol)] focus:ring-0"
                data-testid="task-detail-title"
              />

              <div className="mt-5">
                <label
                  htmlFor="task-detail-description"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Notiz
                </label>
                <textarea
                  id="task-detail-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Was ist zu tun?"
                  rows={4}
                  className="w-full resize-none rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)] px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-[var(--petrol)] focus:ring-[3px] focus:ring-ring/20"
                  data-testid="task-detail-description"
                />
              </div>

              <section
                className="mt-5 overflow-hidden rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)]"
                aria-label="Aufgabenplanung"
              >
                <div className="grid gap-4 p-4 min-[480px]:grid-cols-2">
                  <div>
                    <label
                      htmlFor="task-detail-due-date"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Fällig am
                    </label>
                    <div className="flex h-12 items-center gap-2 rounded-ordilo-sm border border-border/70 bg-[var(--surface-box)] px-3 transition-colors focus-within:border-[var(--petrol)] focus-within:ring-[3px] focus-within:ring-ring/20">
                      <Calendar
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                      <input
                        id="task-detail-due-date"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none focus:ring-0"
                        data-testid="task-detail-due-date"
                      />
                    </div>
                  </div>

                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-foreground">
                      Priorität
                    </legend>
                    <div
                      className="grid grid-cols-3 rounded-ordilo-sm border border-border/70 bg-[var(--surface-box)] p-1"
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
                            "flex h-10 min-w-0 items-center justify-center gap-1 rounded-[8px] px-1 text-xs transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            priority === p.value
                              ? "bg-primary font-medium text-primary-foreground"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                          data-testid={`task-detail-priority-${p.value}`}
                        >
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              priority === p.value && p.value === "medium"
                                ? "bg-primary-foreground/80"
                                : p.dot,
                            )}
                            aria-hidden="true"
                          />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>

                {members.length > 0 && (
                  <div
                    className="border-t border-border/70 p-4"
                    data-testid="task-detail-assignee-section"
                  >
                    <label
                      htmlFor="task-detail-assignee"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Verantwortlich
                    </label>
                    <div className="relative">
                      <User
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                      <select
                        id="task-detail-assignee"
                        value={assignedTo}
                        onChange={(event) => setAssignedTo(event.target.value)}
                        className="h-12 w-full appearance-none rounded-ordilo-sm border border-border/70 bg-[var(--surface-box)] pr-10 pl-10 text-sm text-foreground outline-none transition-colors hover:border-border focus:border-[var(--petrol)] focus:ring-[3px] focus:ring-ring/20"
                        data-testid="task-detail-assignee"
                      >
                        <option value="">Nicht festgelegt</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                )}
              </section>

              {allDocs.length > 0 && (
                <section className="mt-5" data-testid="task-detail-documents">
                  <h3 className="mb-2 text-sm font-medium text-foreground">
                    Verknüpfte Dokumente
                  </h3>
                  <div className="overflow-hidden rounded-ordilo-sm border border-border/70">
                    {allDocs.map((doc) => (
                      <Link
                        key={doc.id}
                        href={`/dokumente?doc=${doc.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onOpenChange(false);
                          void openDocument(doc.id);
                        }}
                        className="flex min-h-12 items-center gap-3 bg-[var(--surface-story)] px-3 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                        data-testid="task-detail-document-link"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-box)] text-muted-foreground">
                          <FileText
                            className="size-4"
                            aria-hidden="true"
                            strokeWidth={1.5}
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {doc.title?.trim() || "Ohne Titel"}
                        </span>
                        {doc.primary && (
                          <span className="sr-only">Hauptdokument</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <div className="mt-5 border-t border-border/60 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMore((current) => !current)}
                  aria-expanded={showMore}
                  aria-controls="task-detail-more"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-ordilo-sm px-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="task-detail-more-toggle"
                >
                  <span>Weitere Angaben</span>
                  <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    {tags.length > 0
                      ? `${tags.length} ${tags.length === 1 ? "Stichwort" : "Stichwörter"}`
                      : "Optional"}
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform",
                        showMore && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </span>
                </button>

                {showMore && (
                  <div
                    id="task-detail-more"
                    className="px-2 pt-3 pb-1"
                    data-testid="task-detail-more"
                  >
                    <div data-testid="task-detail-tags-section">
                      <p className="text-sm font-medium text-foreground">
                        Stichwörter
                      </p>
                      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
                        Helfen dir, die Aufgabe später wiederzufinden.
                      </p>
                      <TagInput
                        value={tags}
                        onChange={setTags}
                        placeholder="Stichwort hinzufügen…"
                        testId="task-detail-tag"
                        disabled={saving}
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                      {createdDate && (
                        <span className="text-xs text-muted-foreground">
                          Erstellt am {createdDate}
                        </span>
                      )}
                      {isOpen && (
                        <button
                          type="button"
                          onClick={handleDismiss}
                          className="ml-auto flex min-h-11 items-center gap-2 rounded-ordilo-sm px-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          data-testid="task-detail-dismiss"
                        >
                          <Trash2
                            className="size-4"
                            aria-hidden="true"
                            strokeWidth={1.5}
                          />
                          Aufgabe verwerfen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border/60 bg-[var(--surface-box)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {hasChanges ? (
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-11 w-full"
                  data-testid="task-detail-save"
                >
                  {saving ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    "Änderungen speichern"
                  )}
                </Button>
              ) : isDismissed ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="h-11 w-full"
                >
                  Aufgabe verworfen
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={isDone ? "outline" : "default"}
                  onClick={handleToggle}
                  className="h-11 w-full"
                  data-testid="task-detail-toggle"
                >
                  {isDone ? (
                    <>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Wieder öffnen
                    </>
                  ) : (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Als erledigt markieren
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
