"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  FileText,
  Check,
  Trash2,
  RotateCcw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ordilo/date-input";
import { createClient } from "@/lib/supabase/client";
import { formatGermanDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
import { useDocumentViewer } from "@/lib/scan/scan-context";
import { TagInput } from "@/components/ordilo/tag-input";
import { DuePresetChips } from "@/components/ordilo/due-preset-chips";
import { AssigneePicker } from "@/components/ordilo/assignee-picker";
import {
  TASK_SCHEDULE_PRESET_LABELS,
  todayAsIsoDate,
} from "@/lib/task-utils";

/** Order-insensitive comparison of two tag arrays. */
function areTagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((tag) => setB.has(tag));
}

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
  /** Signed avatar URLs by member id (photoless members show initials). */
  memberPhotoUrls?: Record<string, string>;
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  onSaved,
  onToggleDone,
  onDismiss,
  members = [],
  memberPhotoUrls = {},
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
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [assignedTo, setAssignedTo] = useState<string>(task?.assigned_to ?? "");
  const [showMore, setShowMore] = useState((task?.tags?.length ?? 0) > 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const minDueDate = todayAsIsoDate();

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
      assignedTo !== (task.assigned_to ?? "") ||
      !areTagsEqual(tags, task.tags ?? []));

  const handleSave = useCallback(async () => {
    if (!task) return;
    if (
      dueDate &&
      dueDate !== (task.due_date ?? "") &&
      dueDate < minDueDate
    ) {
      setError("Bitte wähle heute oder einen späteren Tag.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          title: title.trim() || task.title,
          description: description.trim() || null,
          due_date: dueDate || null,
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
  }, [task, title, description, dueDate, tags, assignedTo, supabase, onSaved, onOpenChange, minDueDate]);

  /**
   * Closing with unsaved edits asks first.
   *
   * The sheet can be dismissed four ways — the X, the overlay, Escape, and
   * a swipe down — and every one of them used to drop a half-typed title on
   * the floor without a word. Everything else on this screen either commits
   * immediately or offers an undo; silently losing work is the one outcome
   * that has neither.
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && hasChanges && !saving) {
        setConfirmDiscard(true);
        return;
      }
      onOpenChange(next);
    },
    [hasChanges, onOpenChange, saving],
  );

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
    <>
    <OrdiloDrawer
      variant="detail"
      open={open}
      onOpenChange={handleOpenChange}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        sheetTitleRef.current?.focus();
      }}
      data-testid="task-detail-sheet"
    >
      <OrdiloDrawerHeader
        title="Aufgabe"
        titleRef={sheetTitleRef}
        titleClassName="text-base font-semibold outline-none"
        titleAdornment={
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
        }
        description="Aufgabe ansehen und bearbeiten"
        descriptionHidden
      />

      {task && (
        <>
          <OrdiloDrawerBody className="py-5">
            {error && (
              <div
                className="mb-4 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* A borderless heading-sized input read as static text — the
                sheet looked like a detail view you could not change. It
                is a labelled field now, with the same chrome as every
                other field in the app. */}
            <div>
              <label
                htmlFor="task-detail-title"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Aufgabe
              </label>
              <input
                id="task-detail-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Was ist zu tun?"
                className="w-full rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)] px-3.5 py-3 text-base font-medium leading-snug text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus:border-[var(--petrol)] focus:ring-[3px] focus:ring-ring/20"
                data-testid="task-detail-title"
              />
            </div>

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
                className="w-full resize-none rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)] px-3.5 py-3 text-base leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-[var(--petrol)] focus:ring-[3px] focus:ring-ring/20 md:text-sm"
                data-testid="task-detail-description"
              />
            </div>

            <section
              className="mt-5 overflow-hidden rounded-ordilo-sm border border-border/70 bg-[var(--surface-story)]"
              aria-label="Aufgabenplanung"
            >
              <div className="p-4">
                <label
                  htmlFor="task-detail-due-date"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Fällig am
                </label>
                {/* Typing a date is the slow path. "Heute" and "Morgen"
                    cover most of what actually changes here. */}
                <DuePresetChips
                  value={dueDate}
                  onChange={setDueDate}
                  testIdPrefix="task-detail"
                >
                  {dueDate && (
                    <button
                      type="button"
                      onClick={() => setDueDate("")}
                      className="inline-flex h-9 items-center rounded-full border border-border bg-[var(--surface-box)] px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-ring"
                      data-testid="task-detail-due-none"
                    >
                      {TASK_SCHEDULE_PRESET_LABELS.none}
                    </button>
                  )}
                </DuePresetChips>
                <DateInput
                  id="task-detail-due-date"
                  value={dueDate}
                  onChange={setDueDate}
                  minDate={minDueDate}
                  className="h-12"
                  aria-label="Fällig am"
                  data-testid="task-detail-due-date"
                />
              </div>

              {members.length > 0 && (
                <div
                  className="border-t border-border/70 p-4"
                  data-testid="task-detail-assignee-section"
                >
                  <AssigneePicker
                    value={assignedTo}
                    onChange={setAssignedTo}
                    members={members}
                    memberPhotoUrls={memberPhotoUrls}
                    testIdPrefix="task-detail"
                  />
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
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-ordilo-sm px-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-ring"
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
                        className="ml-auto flex min-h-11 items-center gap-2 rounded-ordilo-sm px-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive focus-ring"
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
          </OrdiloDrawerBody>

          <OrdiloDrawerFooter>
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
          </OrdiloDrawerFooter>
        </>
      )}
    </OrdiloDrawer>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent
          className="max-w-sm"
          data-testid="task-detail-discard-dialog"
        >
          <DialogHeader>
            <DialogTitle>Änderungen verwerfen?</DialogTitle>
            <DialogDescription>
              Du hast etwas geändert, aber noch nicht gespeichert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 flex-row gap-3 sm:justify-end">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmDiscard(false)}
              data-testid="task-detail-keep-editing"
            >
              Weiter bearbeiten
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setConfirmDiscard(false);
                void handleSave();
              }}
              data-testid="task-detail-save-and-close"
            >
              Speichern
            </Button>
          </DialogFooter>
          <button
            type="button"
            onClick={() => {
              setConfirmDiscard(false);
              onOpenChange(false);
            }}
            className="mx-auto flex min-h-11 items-center rounded-ordilo-sm px-3 text-sm text-muted-foreground transition-colors hover:text-destructive focus-ring"
            data-testid="task-detail-discard"
          >
            Änderungen verwerfen
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
