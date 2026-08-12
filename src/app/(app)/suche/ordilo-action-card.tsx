"use client";

import {
  CalendarPlus,
  Check,
  CircleCheck,
  FilePenLine,
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

const PRIORITY_LABELS: Record<string, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Wöchentlich",
  biweekly: "Alle 14 Tage",
  monthly: "Monatlich",
  yearly: "Jährlich",
};

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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
      const description = asText(args.description);
      return {
        icon: ListPlus,
        eyebrow: "Aufgabe vorbereiten",
        title: asText(args.title) ?? "Neue Aufgabe",
        details: [
          ...(dueDate
            ? [{ label: "Frist", value: formatGermanDate(dueDate) || dueDate }]
            : []),
          ...(assignee ? [{ label: "Für", value: assignee }] : []),
          // The server defaults a missing priority to "medium" — show the
          // value that will actually be written, not just explicit ones.
          {
            label: "Priorität",
            value: PRIORITY_LABELS[args.priority as string] ?? "Mittel",
          },
          ...(description ? [{ label: "Beschreibung", value: description }] : []),
        ],
      };
    }
    case "add_calendar_event": {
      const start = asText(args.starts_on);
      const end = asText(args.ends_on);
      const startTime = asText(args.starts_time);
      const endTime = asText(args.ends_time);
      const recurrence = asText(args.recurrence);
      const attendees = asStringList(args.attendee_names);
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
          ...(args.all_day === true ? [{ label: "Ganztägig", value: "Ja" }] : []),
          ...(startTime
            ? [
                {
                  label: "Uhrzeit",
                  value: endTime ? `${startTime} bis ${endTime}` : startTime,
                },
              ]
            : []),
          ...(recurrence && recurrence !== "none" && RECURRENCE_LABELS[recurrence]
            ? [{ label: "Wiederholung", value: RECURRENCE_LABELS[recurrence] }]
            : []),
          ...(attendees.length
            ? [{ label: "Mit", value: attendees.join(", ") }]
            : []),
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
    case "add_family_member": {
      const role = asText(args.role);
      const birthdate = asText(args.birthdate);
      return {
        icon: UserPlus,
        eyebrow: "Familie ergänzen",
        title: `${asText(args.name) ?? asText(args.member_name) ?? "Neue Person"} hinzufügen`,
        details: [
          ...(role ? [{ label: "Rolle", value: role }] : []),
          ...(birthdate
            ? [
                {
                  label: "Geburtstag",
                  value: formatGermanDate(birthdate) || birthdate,
                },
              ]
            : []),
        ],
      };
    }
    case "create_collection": {
      const iconName = asText(args.icon);
      const color = asText(args.color);
      return {
        icon: FolderPlus,
        eyebrow: "Sammlung anlegen",
        title: asText(args.name) ?? asText(args.collection_name) ?? "Neue Sammlung",
        details: [
          ...(iconName ? [{ label: "Icon", value: iconName }] : []),
          ...(color ? [{ label: "Farbe", value: color }] : []),
        ],
      };
    }
    case "create_note": {
      const content = asText(args.content);
      return {
        icon: FilePenLine,
        eyebrow: "Notiz anlegen",
        title: asText(args.title) ?? "Neue Notiz",
        details: content ? [{ label: "Inhalt", value: content }] : [],
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
    case "save_document_fact": {
      // The tool preview tells us when this proposal overwrites an existing
      // fact of the same type — the card must disclose that correction,
      // including the value being replaced, before "Übernehmen" is tapped.
      const factTypeLabel = asText(args.fact_type_label);
      const label = asText(args.label);
      const value = asText(args.value);
      const existingValue = asText(args.existing_value);
      const isCorrection = Boolean(existingValue);
      const details: Detail[] = [];
      if (factTypeLabel) details.push({ label: "Typ", value: factTypeLabel });
      if (label && label !== factTypeLabel) {
        details.push({ label: "Bezeichnung", value: label });
      }
      if (existingValue) {
        details.push({ label: "Bisheriger Wert", value: existingValue });
      }
      if (value) {
        details.push({
          label: isCorrection ? "Neuer Wert" : "Angabe",
          value,
        });
      }
      return {
        icon: FilePenLine,
        eyebrow: isCorrection ? "Angabe korrigieren" : "Angabe merken",
        title: asText(args.document_title) ?? "Angabe speichern",
        details,
      };
    }
    case "update_task": {
      // Trust rule: every field the confirmation endpoint will write must be
      // visible before "Übernehmen" is enabled. Only fields actually present
      // in the proposal change — absent fields stay untouched server-side.
      const details: Detail[] = [];
      const newTitle = asText(args.title);
      if (newTitle) details.push({ label: "Neuer Titel", value: newTitle });
      if (typeof args.description === "string") {
        const description = args.description.trim();
        details.push({
          label: "Beschreibung",
          value: description || "wird entfernt",
        });
      }
      if (typeof args.due_date === "string") {
        const dueDate = args.due_date.trim();
        details.push({
          label: "Frist",
          value: dueDate
            ? formatGermanDate(dueDate) || dueDate
            : "wird entfernt",
        });
      }
      if (typeof args.priority === "string") {
        const priority = PRIORITY_LABELS[args.priority];
        if (priority) details.push({ label: "Priorität", value: priority });
      }
      if (typeof args.assignee_name === "string") {
        const assignee = args.assignee_name.trim();
        details.push({
          label: "Zuständig",
          value: assignee || "wird entfernt",
        });
      }
      if (args.status === "open" || args.status === "done") {
        details.push({
          label: "Status",
          value: args.status === "done" ? "Erledigt" : "Wieder offen",
        });
      }
      return {
        icon: Pencil,
        eyebrow: "Aufgabe ändern",
        title: asText(args.task_title) ?? newTitle ?? "Aufgabe anpassen",
        details,
      };
    }
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
                <dt className="shrink-0 text-xs text-[var(--mist-dark)]">{detail.label}</dt>
                <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">
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
