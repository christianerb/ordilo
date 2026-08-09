"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Mask typed input as HH:MM (24-hour German time). Digits fill hour and
 * minute segments (caps 2/2), an explicit ":" or "." moves to the minute
 * segment, and overflowing digits roll over — "1630" and "16:30" both
 * become "16:30". A leading digit above 2 pads to a full hour ("9" →
 * "09") so single-digit entry works without a leading zero.
 */
export function maskTimeText(raw: string): string {
  const SEGMENT_CAPS = [2, 2];
  const SEGMENT_MAX = [23, 59];
  const clamp = (segment: string, index: number): string =>
    segment.length === 2 && Number(segment) > SEGMENT_MAX[index]
      ? String(SEGMENT_MAX[index])
      : segment;
  const segments: string[] = [];
  let current = "";
  for (const ch of raw) {
    if (segments.length >= 2) break;
    if (ch === ":" || ch === ".") {
      segments.push(clamp(current.padStart(2, "0"), segments.length));
      current = "";
    } else if (/\d/.test(ch)) {
      if (segments.length === 0 && current.length === 0 && /[3-9]/.test(ch)) {
        // "9" can only be 09:xx — pad and move on to the minutes.
        segments.push(`0${ch}`);
        continue;
      }
      if (current.length >= SEGMENT_CAPS[segments.length]) {
        segments.push(clamp(current, segments.length));
        current = ch;
      } else {
        current += ch;
      }
    }
    // Other characters are dropped.
  }
  if (segments.length < 2) segments.push(clamp(current, segments.length));
  return segments
    .filter((segment, index) => index === 0 || segment !== "")
    .join(":");
}

/** Blur normalization: "9:5" → "09:05", partial hours pad, junk clears. */
export function normalizeTimeText(value: string): string {
  const match = value.match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!match) return value;
  const hour = Math.min(Number(match[1]), 23);
  const minute = Math.min(Number(match[2] || "0"), 59);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface TimeInputProps {
  id?: string;
  /** "HH:MM" value, or an empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

/**
 * A 24-hour time field ("16:30") replacing `<input type="time">`, which
 * renders in the device locale — German families were shown "04:30 PM".
 * Free typing with masking: numeric keypads without a ":" key still work.
 */
export function TimeInput({
  id,
  value,
  onChange,
  disabled,
  className,
  ...rest
}: TimeInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="16:00"
        value={value}
        onChange={(e) => onChange(maskTimeText(e.target.value))}
        onBlur={() => {
          if (value) onChange(normalizeTimeText(value));
        }}
        disabled={disabled}
        maxLength={5}
        className={cn("h-11 rounded-ordilo-md pr-11", className)}
        {...rest}
      />
      <span
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        Uhr
      </span>
    </div>
  );
}
