"use client";

import {
  CalendarPlus,
  Check,
  CircleCheck,
  ContactRound,
  FilePenLine,
  KeyRound,
  FolderPlus,
  ListPlus,
  Loader2,
  Pencil,
  RotateCcw,
  Tag,
  UserPlus,
  X,
} from "lucide-react";
import {
  getChatActionContent,
  type ChatActionToolName,
} from "@ordilo/chat-contract";
import type { ChatAction } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";

const ACTION_ICONS: Record<ChatActionToolName, typeof ListPlus> = {
  add_calendar_event: CalendarPlus,
  add_contact: ContactRound,
  add_document_tags: Tag,
  add_family_member: UserPlus,
  add_task: ListPlus,
  create_collection: FolderPlus,
  create_note: FilePenLine,
  update_note: FilePenLine,
  mark_task_done: CircleCheck,
  move_document_to_collection: FolderPlus,
  save_document_fact: FilePenLine,
  update_task: Pencil,
};

function getActionIcon(action: ChatAction) {
  return action.toolName === "create_note" &&
    action.args.document_type === "credentials"
    ? KeyRound
    : ACTION_ICONS[action.toolName];
}

export function OrdiloActionCard({
  action,
  onConfirm,
  onDismiss,
  onAdjust,
  onUndo,
}: {
  action: ChatAction;
  onConfirm: () => void;
  onDismiss: () => void;
  onAdjust: () => void;
  onUndo?: () => void;
}) {
  const Icon = getActionIcon(action);
  const { eyebrow, title, details } = getChatActionContent(action);
  const isWorking = action.state === "confirming" || action.state === "undoing";
  const isResolved = action.state === "confirmed" || action.state === "undone";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-ordilo-md border bg-[var(--surface-story)]",
        isResolved ? "border-[var(--petrol)]/20" : "border-border",
        action.state === "error" && "border-destructive/30",
        "animate-card-in motion-reduce:animate-none",
      )}
      data-testid="ordilo-action-card"
      aria-live="polite"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm",
              isResolved ? "bg-[var(--petrol)]/10 text-[var(--petrol)]" : "bg-[var(--sand-warm)] text-[var(--petrol)]",
            )}
            aria-hidden="true"
          >
            {isResolved ? <Check className="size-5" /> : <Icon className="size-5" strokeWidth={1.8} />}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-xs font-medium text-[var(--mist-dark)]">
              {action.state === "confirmed"
                ? "Übernommen"
                : action.state === "undone"
                  ? "Rückgängig gemacht"
                  : action.state === "dismissed"
                    ? "Nicht übernommen"
                    : eyebrow}
            </p>
            <h3 className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
              {title}
            </h3>
          </div>
        </div>

        {details.length > 0 && (
          <dl className="mt-3 divide-y divide-border/60 rounded-ordilo-sm bg-card/60 px-3">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-start justify-between gap-3 py-2">
                <dt className="text-xs text-[var(--mist-dark)]">{detail.label}</dt>
                <dd className="min-w-0 max-w-[75%] whitespace-pre-wrap break-words text-right text-xs font-medium text-foreground">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {action.state === "ready" && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--mist-dark)]">
            Ich speichere das erst, wenn du es übernimmst.
          </p>
        )}
        {action.state === "error" && (
          <p role="alert" className="mt-3 text-xs leading-relaxed text-destructive">
            {action.error ?? "Das hat nicht geklappt. Bitte nochmal versuchen."}
          </p>
        )}
      </div>

      {!isResolved && action.state !== "dismissed" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/55 px-3 py-2.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-ordilo-sm bg-[var(--petrol)] px-3.5 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-ring disabled:opacity-60"
            data-testid="action-card-confirm"
          >
            {isWorking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {isWorking ? "Wird übernommen …" : "Übernehmen"}
          </button>
          <button
            type="button"
            onClick={onAdjust}
            disabled={isWorking}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-ordilo-sm px-2.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-ring disabled:opacity-60"
            data-testid="action-card-adjust"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Ändern
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isWorking}
            className="ml-auto flex size-10 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-ring disabled:opacity-60"
            aria-label="Nicht übernehmen"
            title="Nicht übernehmen"
            data-testid="action-card-dismiss"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {action.state === "confirmed" && action.undo && onUndo && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-card/55 px-3 py-2.5">
          <span className="text-xs text-[var(--mist-dark)]">Die Änderung ist gespeichert.</span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-ordilo-sm px-2.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-ring"
            data-testid="action-card-undo"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Rückgängig
          </button>
        </div>
      )}
    </section>
  );
}
