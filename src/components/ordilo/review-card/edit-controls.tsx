"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, Calendar, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toDateInputValue } from "@/lib/format";
import { DateInput } from "@/components/ordilo/date-input";
import {
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/lib/schemas/extraction";

/**
 * Shared "edit" affordance — a small pencil button. By default every field
 * row shows just its recognized value at full width; the actual editor
 * (select, date picker, text input) only appears once the user taps this
 * pencil. This keeps the common "looks right, nothing to change" case calm
 * and readable instead of splitting every row into value + always-on editor.
 */
export function FieldEditButton({
  onClick,
  label,
  testId,
  buttonRef,
}: {
  onClick: () => void;
  label: string;
  testId?: string;
  /** Lets the caller return focus here after its editor closes. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <Pencil className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Category edit control — a pencil that reveals existing categories plus a
 * free-text option.
 */
export function CategoryEditControl({
  value,
  existingCategories,
  onChange,
}: {
  value: string;
  existingCategories: string[];
  onChange: (category: string) => void;
}) {
  const reactId = useId();
  const selectId = `review-category-${reactId}`;
  const inputId = `review-category-input-${reactId}`;
  const [isEditing, setIsEditing] = useState(false);
  const [isFreeText, setIsFreeText] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState("");

  // Check if the current value is in the existing categories.
  const isInExisting = existingCategories.includes(value);

  if (!isEditing) {
    return (
      <FieldEditButton
        onClick={() => setIsEditing(true)}
        label="Sammlung ändern"
        testId="category-edit-button"
      />
    );
  }

  if (isFreeText || (!isInExisting && value && existingCategories.length > 0)) {
    return (
      <div className="flex items-center gap-1">
        <input
          id={inputId}
          name="review-collection"
          type="text"
          value={freeTextValue || value}
          autoFocus
          onChange={(e) => {
            setFreeTextValue(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={() => setIsEditing(false)}
          placeholder="Eigene Sammlung"
          className="w-32 rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 text-base sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Sammlung eingeben"
          data-testid="category-edit-input"
        />
        {existingCategories.length > 0 && (
          <button
            type="button"
            onClick={() => setIsFreeText(false)}
            className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Zurück zur Auswahl"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        id={selectId}
      name="review-collection"
        value={value}
        autoFocus
        onChange={(e) => {
          if (e.target.value === "__free__") {
            setIsFreeText(true);
            setFreeTextValue("");
          } else {
            onChange(e.target.value);
            setIsEditing(false);
          }
        }}
        className="w-full min-w-[12rem] appearance-none truncate rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 pr-7 text-base sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-w-[16rem]"
      aria-label="Sammlung wechseln"
        data-testid="category-edit-select"
      >
        {existingCategories.length === 0 && (
          <option value={value}>{value}</option>
        )}
        {existingCategories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
        <option value="__free__">+ Eigene Sammlung …</option>
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Fact value edit control — pencil toggles a free-text input for correcting
 * an extracted identifier (serial number, contract number, IBAN, …).
 * OCR errors are most costly on identifiers, so a one-tap correction path
 * matters here.
 */
export function FactEditControl({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const reactId = useId();
  const inputId = `review-fact-${reactId}`;
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <FieldEditButton
        onClick={() => setIsEditing(true)}
        label={`${label} korrigieren`}
        testId="edit-fact-button"
      />
    );
  }

  return (
    <input
      id={inputId}
      name="review-fact"
      type="text"
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setIsEditing(false)}
      autoFocus
      className="w-40 rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 font-mono text-base sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-52"
      aria-label={label}
      data-testid="fact-edit-input"
    />
  );
}

export function TextEditControl({
  value,
  label,
  onChange,
  testId,
  inputMode,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  testId: string;
  inputMode?: "text" | "decimal";
}) {
  const reactId = useId();
  const inputId = `review-text-${reactId}`;
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <FieldEditButton
        onClick={() => setIsEditing(true)}
        label={label}
        testId={`${testId}-button`}
      />
    );
  }

  return (
    <input
      id={inputId}
      type="text"
      defaultValue={value}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => setIsEditing(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.currentTarget.blur();
        }
      }}
      autoFocus
      className="w-40 rounded-ordilo-sm border border-border bg-card px-2.5 py-2 text-base sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-52"
      aria-label={label}
      data-testid={`${testId}-input`}
    />
  );
}

export function TaskPriorityEditControl({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <FieldEditButton
        onClick={() => setIsEditing(true)}
        label="Priorität ändern"
        testId="task-priority-edit-button"
      />
    );
  }

  return (
    <select
      value={value}
      autoFocus
      onChange={(event) => {
        onChange(event.target.value as TaskPriority);
        setIsEditing(false);
      }}
      onBlur={() => setIsEditing(false)}
      className="rounded-ordilo-sm border border-border bg-card px-2.5 py-2 text-base sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label="Priorität wählen"
      data-testid="task-priority-edit-select"
    >
      {TASK_PRIORITIES.map((priority) => (
        <option key={priority} value={priority}>
          {priority === "high"
            ? "Hoch"
            : priority === "medium"
              ? "Mittel"
              : "Niedrig"}
        </option>
      ))}
    </select>
  );
}

/**
 * Date edit control — a pencil that reveals a date input field. In `compact`
 * mode (inline next to a task's due date) the pencil is a small petrol icon;
 * otherwise it matches the standard field pencil.
 */
export function DateEditControl({
  value,
  label,
  onChange,
  compact = false,
  showAddButton = false,
}: {
  value: string;
  label: string;
  onChange: (date: string) => void;
  compact?: boolean;
  showAddButton?: boolean;
}) {
  const reactId = useId();
  const inputId = `review-date-${reactId}`;
  const [isEditing, setIsEditing] = useState(false);
  // Tracks whether the calendar popover is open, so a blur caused by focus
  // moving INTO the (portaled) calendar doesn't close the editor.
  const calendarOpenRef = useRef(false);

  if (showAddButton && !isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
        aria-label={label}
        data-testid="add-date-button"
      >
        <Calendar className="size-3.5" aria-hidden="true" />
        {label}
      </button>
    );
  }

  if (!isEditing && value) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={cn(
          "inline-flex min-h-11 items-center justify-center rounded-ordilo-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          compact
            ? "gap-1 px-1.5 text-[var(--petrol)] hover:text-[var(--petrol-dark)]"
            : "size-11 text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label={`${label} bearbeiten`}
        data-testid="edit-date-button"
      >
        <Pencil className={compact ? "size-3" : "size-4"} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      className={cn("inline-block", compact ? "w-28" : "w-32")}
      onBlur={(e) => {
        // Focus stayed inside the field (e.g. moved to the calendar trigger).
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        // Defer past the click so a calendar day-pick's onChange fires before
        // we unmount; only close when the calendar isn't open (a real tap-away).
        setTimeout(() => {
          if (!calendarOpenRef.current) setIsEditing(false);
        }, 0);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !calendarOpenRef.current) {
          setIsEditing(false);
        }
      }}
    >
      <DateInput
        id={inputId}
        value={toDateInputValue(value)}
        // Typing updates the value live but keeps the editor open: parseGermanDate
        // accepts one-digit segments, so replacing a single day/month digit would
        // otherwise close the field before the second digit is typed.
        onChange={(iso) => onChange(iso)}
        // Only a deliberate calendar pick completes the edit (text edits close
        // via tap-away blur or Escape, like the other inline edit controls).
        onPickDate={() => setIsEditing(false)}
        onOpenChange={(open) => {
          calendarOpenRef.current = open;
        }}
        autoFocus
        aria-label={label}
        data-testid="date-edit-input"
        className="h-9"
      />
    </div>
  );
}
