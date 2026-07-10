"use client";

import {
  CalendarDays,
  ListChecks,
  FileText,
  Info,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerCard as AnswerCardData } from "@/lib/schemas/chat";

const CARD_TYPE_ICON: Record<AnswerCardData["type"], LucideIcon> = {
  termin: CalendarDays,
  aufgabe: ListChecks,
  dokument: FileText,
  allgemein: Info,
};

const CARD_TYPE_ACTION_LABEL: Record<AnswerCardData["type"], string> = {
  termin: "Zum Termin",
  aufgabe: "Zur Aufgabe",
  dokument: "Zum Dokument",
  allgemein: "Zum Dokument",
};

export interface AnswerCardProps {
  card: AnswerCardData;
  /** Called when the action button is clicked (only rendered when `card.actionDocumentId` is set). */
  onActionClick?: (documentId: string) => void;
  className?: string;
}

/**
 * Answer Card — renders a single structured result (e.g. an appointment,
 * a task, a document fact) as a compact card with a title, optional
 * subtitle, label/value detail fields, and an optional action button
 * linking to the source document.
 *
 * Emitted by the assistant via the `present_answer_card` tool for
 * questions whose answer is exactly one concrete result (VAL-CHAT design
 * refresh: structured answer cards). Replaces free-flowing Markdown text
 * for these cases.
 *
 * @example
 * <AnswerCard
 *   card={{
 *     type: "termin",
 *     title: "Zahnarzttermin",
 *     subtitle: "Emma",
 *     fields: [{ label: "Datum", value: "12.08.2026" }],
 *     actionDocumentId: "doc-123",
 *   }}
 *   onActionClick={(id) => router.push(`/dokumente?doc=${id}`)}
 * />
 */
export function AnswerCard({ card, onActionClick, className }: AnswerCardProps) {
  const Icon = CARD_TYPE_ICON[card.type] ?? Info;
  const actionLabel = CARD_TYPE_ACTION_LABEL[card.type] ?? "Zum Dokument";

  return (
    <div
      data-testid="answer-card"
      data-card-type={card.type}
      className={cn(
        "w-full rounded-ordilo-md border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <Icon className="size-5" style={{ color: "var(--petrol)" }} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{card.title}</p>
          {card.subtitle && (
            <p className="truncate text-sm text-muted-foreground">{card.subtitle}</p>
          )}
        </div>
      </div>

      {card.fields.length > 0 && (
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
          {card.fields.map((field, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {card.actionDocumentId && (
        <button
          type="button"
          onClick={() => onActionClick?.(card.actionDocumentId!)}
          data-testid="answer-card-action"
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-ordilo-sm bg-[var(--petrol)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {actionLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
