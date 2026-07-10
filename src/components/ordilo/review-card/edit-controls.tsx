"use client";

import { useId, useState } from "react";
import { ChevronDown, Calendar, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toDateInputValue } from "@/lib/format";
import type { FamilyMemberOption } from "@/lib/analysis";

/**
 * Person edit control — a dropdown of family members.
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

  if (familyMembers.length === 0) return null;

  return (
    <div className="relative">
      <select
        id={selectId}
        name="review-person"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
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
 * Category edit control — existing categories + free-text.
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
  const [isFreeText, setIsFreeText] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState("");

  // Check if the current value is in the existing categories.
  const isInExisting = existingCategories.includes(value);

  if (isFreeText || (!isInExisting && value && existingCategories.length > 0)) {
    return (
      <div className="flex items-center gap-1">
        <input
          id={inputId}
          name="review-category"
          type="text"
          value={freeTextValue || value}
          onChange={(e) => {
            setFreeTextValue(e.target.value);
            onChange(e.target.value);
          }}
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
        onChange={(e) => {
          if (e.target.value === "__free__") {
            setIsFreeText(true);
            setFreeTextValue("");
          } else {
            onChange(e.target.value);
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
 * Date edit control — a date input field.
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

  if (compact && !isEditing && value) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
        aria-label={`${label} bearbeiten`}
        data-testid="edit-date-button"
      >
        <Pencil className="size-3" aria-hidden="true" />
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
