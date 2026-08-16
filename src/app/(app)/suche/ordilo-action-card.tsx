"use client";

import {
  CalendarPlus,
  Check,
  CircleCheck,
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
import type { ChatAction } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";

type Detail = { label: string; value: string };

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getActionContent(action: ChatAction): {
  icon: typeof ListPlus;
  eyebrow: string;
  title: string;
  details: Detail[];
} {
  const args = action.args;

  switch (action.toolName) {
    case "add_task": {
      const dueDate = asText(args.due_date);
      const assignee = asText(args.assignee_name);
      return {
        icon: ListPlus,
        eyebrow: "Aufgabe vorbereiten",
        title: asText(args.title) ?? "Neue Aufgabe",
        details: [
          ...(dueDate
            ? [{ label: "Frist", value: formatGermanDate(dueDate) || dueDate }]
            : []),
          ...(assignee ? [{ label: "Für", value: assignee }] : []),
        ],
      };
    }
    case "add_calendar_event": {
      const start = asText(args.starts_on);
      const end = asText(args.ends_on);
      const time = asText(args.starts_time);
      const date =
        start && end && end !== start
          ? `${formatGermanDate(start) || start} bis ${formatGermanDate(end) || end}`
          : start
            ? formatGermanDate(start) || start
            : null;
      return {
        icon: CalendarPlus,
        eyebrow: "Termin vorbereiten",
        title: asText(args.title) ?? "Neuer Termin",
        details: [
          ...(date ? [{ label: "Wann", value: date }] : []),
          ...(time ? [{ label: "Uhrzeit", value: time }] : []),
        ],
      };
    }
    case "mark_task_done":
      return {
        icon: CircleCheck,
        eyebrow: "Aufgabe abschließen",
        title: asText(args.task_title) ?? "Aufgabe erledigen",
        details: [],
      };
    case "add_family_member":
      return {
        icon: UserPlus,
        eyebrow: "Familie ergänzen",
        title: `${asText(args.name) ?? asText(args.member_name) ?? "Neue Person"} hinzufügen`,
        details: [],
      };
    case "create_collection":
      return {
        icon: FolderPlus,
        eyebrow: "Sammlung anlegen",
        title: asText(args.name) ?? asText(args.collection_name) ?? "Neue Sammlung",
        details: [],
      };
    case "create_note": {
      const isCredentials = asText(args.document_type) === "credentials";
      const details: { label: string; value: string }[] = [];
      if (isCredentials) {
        const url = asText(args.url);
        const username = asText(args.username);
        if (url) details.push({ label: "URL", value: url });
        if (username) details.push({ label: "Benutzername", value: username });
      }
      return {
        icon: isCredentials ? KeyRound : FilePenLine,
        eyebrow: isCredentials ? "Zugangsdaten anlegen" : "Notiz anlegen",
        title: asText(args.title) ?? (isCredentials ? "Neue Zugangsdaten" : "Neue Notiz"),
        details,
      };
    }
    case "move_document_to_collection":
      return {
        icon: FolderPlus,
        eyebrow: "Dokument einsortieren",
        title: asText(args.document_title) ?? "Dokument verschieben",
        details: asText(args.collection_name)
          ? [{ label: "Sammlung", value: asText(args.collection_name)! }]
          : [],
      };
    case "add_document_tags": {
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      return {
        icon: Tag,
        eyebrow: "Schlagworte ergänzen",
        title: asText(args.document_title) ?? "Dokument ergänzen",
        details: tags.length ? [{ label: "Schlagworte", value: tags.join(", ") }] : [],
      };
    }
    case "save_document_fact":
      return {
        icon: FilePenLine,
        eyebrow: "Angabe merken",
        title: asText(args.document_title) ?? "Angabe speichern",
        details: asText(args.value)
          ? [{ label: asText(args.label) ?? "Angabe", value: asText(args.value)! }]
          : [],
      };
    case "update_task":
      return {
        icon: Pencil,
        eyebrow: "Aufgabe ändern",
        title: asText(args.task_title) ?? "Aufgabe anpassen",
        details: [],
      };
  }
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
  const { icon: Icon, eyebrow, title, details } = getActionContent(action);
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
              <div key={detail.label} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-xs text-[var(--mist-dark)]">{detail.label}</dt>
                <dd className="min-w-0 text-right text-xs font-medium text-foreground">
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
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-ordilo-sm bg-[var(--petrol)] px-3.5 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            data-testid="action-card-confirm"
          >
            {isWorking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {isWorking ? "Wird übernommen …" : "Übernehmen"}
          </button>
          <button
            type="button"
            onClick={onAdjust}
            disabled={isWorking}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-ordilo-sm px-2.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            data-testid="action-card-adjust"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Ändern
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isWorking}
            className="ml-auto flex size-10 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
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
            className="inline-flex min-h-10 items-center gap-1.5 rounded-ordilo-sm px-2.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
