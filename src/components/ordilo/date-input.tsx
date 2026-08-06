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
 * Mask typed input as TT.MM.JJJJ. Numeric mobile keypads
 * (inputMode="numeric") have no dot key, so dots are inserted
 * automatically: typing "06082026" yields "06.08.2026". Explicitly typed
 * dots are stripped and re-inserted at the right positions, so both
 * entry styles converge on the same masked text.
 */
function maskGermanDateText(raw: string): string {
  const trimmed = raw.trim();
  // Pasted ISO dates (yyyy-mm-dd) convert straight to German text.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return toGermanDateText(trimmed);
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
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
  "aria-label"?: string;
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
  ...rest
}: DateInputProps) {
  const [text, setText] = useState(() => (value ? toGermanDateText(value) : ""));
  const [open, setOpen] = useState(false);
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
      onChange("");
      return;
    }
    const parsed = parseGermanDate(masked);
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
    onChange(iso);
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
          placeholder="TT.MM.JJJJ"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          disabled={disabled}
          className="h-11 rounded-ordilo-md pr-11"
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
