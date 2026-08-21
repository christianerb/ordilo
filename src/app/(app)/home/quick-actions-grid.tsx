"use client";

import {
  CalendarPlus,
  FileText,
  ListChecks,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";

/**
 * "Schnellaktionen" — four one-tap shortcuts to the things a family
 * actually starts from Home: a new appointment, a new task, a new
 * document, or a question for Ordilo. Termin and Aufgabe fill a real
 * gap (the composer's "+" sheet only offers upload/note/collection);
 * Dokument and Fragen intentionally reuse the same actions already
 * reachable one tap below, as a faster, always-visible alternative.
 */
export function QuickActionsGrid({
  onNewEvent,
  onNewTask,
  onNewDocument,
  onAskQuestion,
}: {
  onNewEvent: () => void;
  onNewTask: () => void;
  onNewDocument: () => void;
  onAskQuestion: () => void;
}) {
  return (
    <section data-testid="home-quick-actions">
      <h2 className="pb-2 text-sm font-semibold text-foreground">
        Schnellaktionen
      </h2>
      <div className="grid grid-cols-4 gap-2">
        <QuickActionTile
          icon={CalendarPlus}
          label="Termin"
          wash="var(--wash-sage)"
          onClick={onNewEvent}
          testId="home-quick-action-event"
        />
        <QuickActionTile
          icon={ListChecks}
          label="Aufgabe"
          wash="var(--wash-apricot)"
          onClick={onNewTask}
          testId="home-quick-action-task"
        />
        <QuickActionTile
          icon={FileText}
          label="Dokument"
          wash="var(--wash-blue)"
          onClick={onNewDocument}
          testId="home-quick-action-document"
        />
        <QuickActionTile
          icon={MessageCircleQuestion}
          label="Fragen"
          wash="var(--wash-lavender)"
          onClick={onAskQuestion}
          testId="home-quick-action-ask"
        />
      </div>
    </section>
  );
}

function QuickActionTile({
  icon: Icon,
  label,
  wash,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  wash: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-col items-center gap-1.5 rounded-ordilo-sm border border-white/80 bg-[var(--surface-box)] px-1 py-3 shadow-card transition-shadow hover:shadow-card-hover focus-ring"
    >
      <span
        className="flex size-9 items-center justify-center rounded-full"
        style={{ backgroundColor: wash }}
        aria-hidden="true"
      >
        <Icon className="size-4" style={{ color: "var(--petrol)" }} strokeWidth={1.8} />
      </span>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </button>
  );
}
