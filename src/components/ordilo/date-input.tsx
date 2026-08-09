"use client";

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABELS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Parse a "TT.MM.JJJJ" string into an ISO "yyyy-mm-dd" date, or null if invalid. */
function parseGermanDate(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Format an ISO "yyyy-mm-dd" date as a German "TT.MM.JJJJ" string. */
function toGermanDateText(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
}

/**
 * Mask typed input as TT.MM.JJJJ. Walks the input filling day/month/year
 * segments (caps 2/2/4): an explicit dot moves to the next segment, and
 * digits beyond a segment's cap roll into the next one. Both entry
 * styles converge on valid text — "06082026" (numeric mobile keypads
 * have no dot key) becomes "06.08.2026", while "6.8.2026" keeps its
 * explicit separators and stays parseable.
 */
function maskGermanDateText(raw: string): string {
  const trimmed = raw.trim();
  // Pasted ISO dates (yyyy-mm-dd) convert straight to German text.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return toGermanDateText(trimmed);
  const SEGMENT_CAPS = [2, 2, 4];
  const segments: string[] = [];
  let current = "";
  for (const ch of raw) {
    if (segments.length >= 3) break;
    if (ch === ".") {
      segments.push(current);
      current = "";
    } else if (/\d/.test(ch)) {
      if (current.length >= SEGMENT_CAPS[segments.length]) {
        // Segment full: roll over into the next one.
        segments.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    // Other characters are dropped.
  }
  if (segments.length < 3) segments.push(current);
  return segments.join(".");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday-first weekday index (0 = Monday … 6 = Sunday) for the 1st of the month. */
function firstWeekdayOffset(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export interface DateInputProps {
  id?: string;
  /** ISO "yyyy-mm-dd" value, or an empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Focus the text input on mount (e.g. when an inline editor appears). */
  autoFocus?: boolean;
  /** Called when the calendar popover opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Fires when the typed text switches between parseable and not.
   * `onChange` only reports valid dates, so without this a form cannot
   * tell "field shows 31.02.2027" apart from "field shows the saved
   * value" — and would silently save the stale date. Empty text counts
   * as valid; required-ness stays the form's job.
   */
  onValidChange?: (valid: boolean) => void;
  /**
   * Called only when a day is deliberately picked from the calendar — unlike
   * `onChange`, which also fires for partial keystrokes while typing. Inline
   * editors use this as the "done" signal so typing corrections don't close
   * the field early.
   */
  onPickDate?: (iso: string) => void;
  "aria-label"?: string;
  /** Extra classes merged onto the text input (e.g. to match adjacent field height). */
  className?: string;
  "data-testid"?: string;
}

/**
 * A date field pairing a free-typing text input (German TT.MM.JJJJ format)
 * with a calendar popover — the native `<input type="date">` picker looks
 * and behaves differently across every browser/OS and offers no visible
 * calendar grid on some platforms.
 */
export function DateInput({
  id,
  value,
  onChange,
  disabled,
  autoFocus,
  onOpenChange,
  onValidChange,
  onPickDate,
  className,
  ...rest
}: DateInputProps) {
  const [text, setText] = useState(() => (value ? toGermanDateText(value) : ""));
  const [open, setOpen] = useState(false);

  // Sync the visible text when the value prop changes EXTERNALLY (e.g. a
  // form auto-adjusts the end date after the start moved past it). While
  // the user types, onChange keeps prop and parsed text equal, so this
  // never fires mid-edit.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (parseGermanDate(text) !== (value || null)) {
      setText(value ? toGermanDateText(value) : "");
    }
  }
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(() => {
    const parsed = value ? new Date(value) : today;
    return isNaN(parsed.getTime()) ? today.getFullYear() : parsed.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const parsed = value ? new Date(value) : today;
    return isNaN(parsed.getTime()) ? today.getMonth() : parsed.getMonth();
  });

  const handleTextChange = (next: string) => {
    const masked = maskGermanDateText(next);
    setText(masked);
    if (masked.trim() === "") {
      onValidChange?.(true);
      onChange("");
      return;
    }
    const parsed = parseGermanDate(masked);
    onValidChange?.(parsed !== null);
    if (parsed) onChange(parsed);
  };

  const jumpTo = (iso: string) => {
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next) jumpTo(value || today.toISOString().slice(0, 10));
    setOpen(next);
    onOpenChange?.(next);
  };

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handlePickDay = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onValidChange?.(true);
    onChange(iso);
    onPickDate?.(iso);
    setText(toGermanDateText(iso));
    setOpen(false);
  };

  const totalDays = daysInMonth(viewYear, viewMonth);
  const offset = firstWeekdayOffset(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="TT.MM.JJJJ"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          disabled={disabled}
          className={cn("h-11 rounded-ordilo-md pr-11", className)}
          {...rest}
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Kalender öffnen"
            data-testid="date-input-calendar-trigger"
            className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <CalendarIcon className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="Vorheriger Monat"
            className="flex size-8 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <p className="text-sm font-medium text-foreground" data-testid="date-input-month-label">
            {MONTH_LABELS[viewMonth]} {viewYear}
          </p>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Nächster Monat"
            className="flex size-8 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="py-1">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={`pad-${i}`} aria-hidden="true" />;
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isSelected = iso === value;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => handlePickDay(day)}
                aria-pressed={isSelected}
                aria-label={`${day}. ${MONTH_LABELS[viewMonth]} ${viewYear} auswählen`}
                data-testid="date-input-day"
                className={cn(
                  "flex size-8 items-center justify-center rounded-ordilo-sm text-sm transition-colors hover:bg-accent",
                  isSelected
                    ? "bg-[var(--petrol)] text-white hover:bg-[var(--petrol-dark)]"
                    : "text-foreground",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
