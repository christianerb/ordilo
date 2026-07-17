"use client";

import { useId, useState } from "react";
import { ChevronDown, Calendar, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toDateInputValue } from "@/lib/format";
import type { FamilyMemberOption } from "@/lib/analysis";

/**
 * Shared "edit" affordance — a small pencil button. By default every field
 * row shows just its recognized value at full width; the actual editor
 * (select, date picker, text input) only appears once the user taps this
 * pencil. This keeps the common "looks right, nothing to change" case calm
 * and readable instead of splitting every row into value + always-on editor.
 */
function FieldEditButton({
  onClick,
  label,
  testId,
}: {
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={label}
      data-testid={testId}
    >
      <Pencil className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Person edit control — a pencil that reveals a dropdown of family members.
 */
export function PersonEditControl({
  value,
  familyMembers,
  onChange,
}: {
  value: string | null;
  familyMembers: FamilyMemberOption[];
  onChange: (memberId: string | null) => void;
}) {
  const reactId = useId();
  const selectId = `review-person-${reactId}`;
  const [isEditing, setIsEditing] = useState(false);

  if (familyMembers.length === 0) return null;

  if (!isEditing) {
    return (
      <FieldEditButton
        onClick={() => setIsEditing(true)}
        label="Person ändern"
        testId="person-edit-button"
      />
    );
  }

  return (
    <div className="relative">
      <select
        id={selectId}
        name="review-person"
        value={value ?? ""}
        autoFocus
        onChange={(e) => {
          onChange(e.target.value || null);
          setIsEditing(false);
        }}
        onBlur={() => setIsEditing(false)}
        className="w-full min-w-[12rem] appearance-none truncate rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-w-[16rem]"
        aria-label="Person wechseln"
        data-testid="person-edit-select"
      >
        <option value="">Person wählen …</option>
        {familyMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
            {member.role ? ` (${member.role})` : ""}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
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
        label="Kategorie ändern"
        testId="category-edit-button"
      />
    );
  }

  if (isFreeText || (!isInExisting && value && existingCategories.length > 0)) {
    return (
      <div className="flex items-center gap-1">
        <input
          id={inputId}
          name="review-category"
          type="text"
          value={freeTextValue || value}
          autoFocus
          onChange={(e) => {
            setFreeTextValue(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={() => setIsEditing(false)}
          placeholder="Eigene Kategorie"
          className="w-32 rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Kategorie eingeben"
          data-testid="category-edit-input"
        />
        {existingCategories.length > 0 && (
          <button
            type="button"
            onClick={() => setIsFreeText(false)}
            className="flex size-7 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
        name="review-category"
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
        className="w-full min-w-[12rem] appearance-none truncate rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-w-[16rem]"
        aria-label="Kategorie wechseln"
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
        <option value="__free__">+ Eigene Kategorie …</option>
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
      className="w-40 rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-52"
      aria-label={label}
      data-testid="fact-edit-input"
    />
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
          "inline-flex items-center justify-center rounded-ordilo-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          compact
            ? "gap-1 text-[var(--petrol)] hover:text-[var(--petrol-dark)]"
            : "size-7 text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label={`${label} bearbeiten`}
        data-testid="edit-date-button"
      >
        <Pencil className={compact ? "size-3" : "size-4"} aria-hidden="true" />
      </button>
    );
  }

  return (
    <input
      id={inputId}
      name="review-date"
      type="date"
      value={toDateInputValue(value)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setIsEditing(false)}
      autoFocus={isEditing}
      className={cn(
        "rounded-ordilo-sm border border-border bg-card px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        compact ? "w-28" : "w-32",
      )}
      aria-label={label}
      data-testid="date-edit-input"
    />
  );
}
