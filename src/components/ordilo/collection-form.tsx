"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COLLECTION_ICON_OPTIONS,
  COLLECTION_COLOR_OPTIONS,
} from "@/lib/schemas/collections";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/** The form values for a collection (add or edit). */
export interface CollectionFormValues {
  name: string;
  icon: string;
  color: string;
}

export interface CollectionFormProps {
  /** Pre-filled values (for edit mode). Defaults to the first icon/color for add mode. */
  initialValues?: Partial<CollectionFormValues>;
  /** German label for the submit button. */
  submitLabel: string;
  /** Called when the form is submitted with valid values. */
  onSubmit: (values: CollectionFormValues) => void;
  /** Whether the form is currently submitting (disables inputs). */
  isSubmitting?: boolean;
  /** Optional German server error to display. */
  serverError?: string | null;
  /** Called when the user clears the server error (e.g. on input change). */
  onClearServerError?: () => void;
}

/**
 * Collection Form — a reusable form for adding or editing a collection
 * ("Sammlung"): name, icon, and color.
 *
 * Icon and color are each chosen from a small, fixed palette so every
 * collection stays within the app's design-token colors (Do's and Don'ts,
 * DESIGN.md) while still letting each folder look visually distinct.
 */
export function CollectionForm({
  initialValues,
  submitLabel,
  onSubmit,
  isSubmitting = false,
  serverError,
  onClearServerError,
}: CollectionFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [icon, setIcon] = useState(
    initialValues?.icon ?? COLLECTION_ICON_OPTIONS[0].key,
  );
  const [color, setColor] = useState(
    initialValues?.color ?? COLLECTION_COLOR_OPTIONS[0].key,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useMountEffect(() => {
    nameInputRef.current?.focus();
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setValidationError("Bitte gib einen Namen ein");
      return;
    }
    setValidationError(null);
    onSubmit({ name: name.trim(), icon, color });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (validationError) setValidationError(null);
    if (serverError) onClearServerError?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Name (required) */}
      <div className="space-y-2">
        <Label htmlFor="collection-name">Name</Label>
        <Input
          ref={nameInputRef}
          id="collection-name"
          type="text"
          autoComplete="off"
          placeholder="z. B. Versicherungen"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          aria-invalid={validationError ? true : undefined}
          disabled={isSubmitting}
          className="h-12 rounded-ordilo-md text-base"
        />
        {validationError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {validationError}
          </p>
        )}
      </div>

      {/* Icon picker */}
      <div className="space-y-2">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-2">
          {COLLECTION_ICON_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = icon === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setIcon(opt.key)}
                disabled={isSubmitting}
                aria-label={opt.label}
                aria-pressed={selected}
                className={cn(
                  "flex size-10 items-center justify-center rounded-ordilo-sm transition-all",
                  selected
                    ? "ring-2 ring-[var(--petrol)] ring-offset-2 ring-offset-background bg-[var(--petrol)]/10"
                    : "ring-1 ring-border hover:bg-accent",
                )}
              >
                <Icon
                  className="size-5"
                  style={{ color: "var(--mist-dark)" }}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Color picker */}
      <div className="space-y-2">
        <Label>Farbe</Label>
        <div className="flex flex-wrap gap-2">
          {COLLECTION_COLOR_OPTIONS.map((opt) => {
            const selected = color === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setColor(opt.key)}
                disabled={isSubmitting}
                aria-label={opt.label}
                aria-pressed={selected}
                className={cn(
                  "size-9 rounded-full transition-all",
                  selected
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    : "ring-1 ring-border",
                )}
                style={{ backgroundColor: opt.fg }}
              />
            );
          })}
        </div>
      </div>

      {/* Server error */}
      {serverError && (
        <div
          role="alert"
          className="rounded-ordilo-md border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <p className="text-sm font-medium text-destructive">{serverError}</p>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting}
        className="h-12 w-full rounded-ordilo-md text-base"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Wird gespeichert…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
