import { FileText, CalendarClock, Calendar, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import type { TimelineEvent, TimelineEventType } from "@/lib/profile-utils";

// ---------------------------------------------------------------------------
// Icon and label mapping per event type
// ---------------------------------------------------------------------------

/**
 * Map each timeline event type to its icon.
 * - document → FileText (a document was added)
 * - task → CalendarClock (a task with a deadline)
 * - date → Calendar (an important date extracted from a document)
 */
const EVENT_ICONS: Record<TimelineEventType, LucideIcon> = {
  document: FileText,
  task: CalendarClock,
  date: Calendar,
};

/**
 * Get the icon for a timeline event type.
 */
function getEventIcon(type: TimelineEventType): LucideIcon {
  return EVENT_ICONS[type] ?? FileText;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Props for the TimelineItem component.
 */
export interface TimelineItemProps {
  /** The timeline event to display. */
  event: TimelineEvent;
  /** Called when the content card is clicked (for navigation to document). */
  onClick?: () => void;
  /** When true, hides the vertical connector line below this item. */
  isLast?: boolean;
  /** Optional additional className. */
  className?: string;
}

/**
 * Timeline Item — a single entry in a person's timeline.
 *
 * Visual structure:
 * - Left: a vertical connector line with a dot containing the event icon
 * - Right: a content card showing the formatted German date, title, and
 *   optional description
 *
 * The connector line extends downward to connect to the next item. When
 * `isLast` is true, the connector is hidden.
 *
 * When `onClick` is provided, the content card is interactive (renders as
 * a button) and navigates to the linked document on click.
 *
 * Design:
 * - Warm card surface (sand) with 20px radius and soft shadow
 * - Petrol-colored dot with a white icon
 - Mobile-friendly (flex layout, no overflow)
 *
 * @example
 * <TimelineItem
 *   event={{ type: "document", date: "2026-07-15", title: "Kita-Brief", documentId: "doc-1" }}
 *   onClick={() => navigateToDocument("doc-1")}
 * />
 */
export function TimelineItem({
  event,
  onClick,
  isLast = false,
  className,
}: TimelineItemProps) {
  const Icon = getEventIcon(event.type);
  const formattedDate = formatGermanDate(event.date);

  const content = (
    <>
      {/* Date */}
      {formattedDate && (
        <p
          className="text-xs font-medium text-muted-foreground"
          data-testid="timeline-date"
        >
          {formattedDate}
        </p>
      )}

      {/* Title */}
      <p
        className="font-medium text-foreground"
        data-testid="timeline-title"
      >
        {event.title}
      </p>

      {/* Description */}
      {event.description && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="timeline-description"
        >
          {event.description}
        </p>
      )}
    </>
  );

  return (
    <div
      data-testid="timeline-item"
      data-type={event.type}
      className={cn("flex gap-3", className)}
    >
      {/* Left column: connector + dot */}
      <div className="flex flex-col items-center">
        {/* Dot with icon */}
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--petrol)" }}
          aria-hidden="true"
          data-testid="timeline-dot"
        >
          <Icon
            className="size-5 text-white"
            strokeWidth={1.5}
          />
        </div>

        {/* Vertical connector line */}
        <div
          className={cn(
            "w-px flex-1 min-h-[1.5rem]",
            isLast && "hidden",
          )}
          style={{ backgroundColor: "var(--mist-light)" }}
          data-testid="timeline-connector"
          aria-hidden="true"
        />
      </div>

      {/* Right column: content card */}
      <div className="min-w-0 flex-1 pb-4">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="w-full rounded-ordilo-md border border-border bg-card p-3 text-left shadow-card transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="timeline-content"
          >
            {content}
          </button>
        ) : (
          <div
            className="rounded-ordilo-md border border-border bg-card p-3 shadow-card"
            data-testid="timeline-content"
          >
            {content}
          </div>
        )}
      </div>
    </div>
  );
}
