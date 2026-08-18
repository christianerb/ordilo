"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

const DEFAULT_DIGIT_COUNT = 6;

/**
 * A six-digit code input that accepts typing and pasting without making a
 * family member manually distribute digits across fields.
 */
export function OtpCodeInput({
  value,
  onChange,
  label,
  disabled = false,
  autoFocus = false,
  digitCount = DEFAULT_DIGIT_COUNT,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
  digitCount?: number;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from(
    { length: digitCount },
    (_, index) => value[index] ?? "",
  );

  useMountEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
  });

  const applyDigits = (nextDigits: string, startIndex: number) => {
    const sanitized = nextDigits.replace(/\D/g, "").slice(0, digitCount);
    if (!sanitized) return;
    const next = value.padEnd(digitCount, " ").split("");
    [...sanitized].forEach((digit, offset) => {
      if (startIndex + offset < digitCount) next[startIndex + offset] = digit;
    });
    onChange(next.join("").trimEnd());
    inputRefs.current[
      Math.min(startIndex + sanitized.length, digitCount - 1)
    ]?.focus();
  };

  const handleChange = (nextValue: string, index: number) => {
    const sanitized = nextValue.replace(/\D/g, "").slice(0, digitCount);
    if (!sanitized) {
      const next = value.padEnd(digitCount, " ").split("");
      next[index] = " ";
      onChange(next.join("").trimEnd());
      return;
    }
    applyDigits(sanitized, index);
  };

  return (
    <div
      className="grid grid-cols-6 gap-2 sm:gap-3"
      onPaste={(event) => {
        const pasted = event.clipboardData.getData("text");
        if (!pasted) return;
        event.preventDefault();
        applyDigits(pasted, focusedIndex);
      }}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          aria-label={`Ziffer ${index + 1} des ${label}`}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={digitCount}
          value={digit}
          onChange={(event) => handleChange(event.target.value, index)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !value[index] && index > 0) {
              inputRefs.current[index - 1]?.focus();
            }
          }}
          onFocus={() => setFocusedIndex(index)}
          disabled={disabled}
          className={cn(
            "h-14 min-w-0 rounded-ordilo-sm border bg-[var(--warm-white)] text-center text-xl font-medium tabular-nums text-foreground outline-none transition-[border-color,box-shadow,transform] duration-200",
            focusedIndex === index
              ? "border-primary ring-[3px] ring-ring/20"
              : "border-border",
            "disabled:cursor-wait disabled:opacity-60",
          )}
        />
      ))}
    </div>
  );
}
