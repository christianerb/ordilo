"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVATAR_COLORS } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";

/**
 * The form values for a member (add or edit).
 */
export interface MemberFormValues {
  name: string;
  role: string;
  birthdate: string;
  avatar_color: string;
}

/**
 * Props for the MemberForm component.
 */
export interface MemberFormProps {
  /** Pre-filled values (for edit mode). Defaults to empty for add mode. */
  initialValues?: Partial<MemberFormValues>;
  /** German label for the submit button. */
  submitLabel: string;
  /** Called when the form is submitted with valid values. */
  onSubmit: (values: MemberFormValues) => void;
  /** Whether the form is currently submitting (disables inputs). */
  isSubmitting?: boolean;
  /** Optional German validation error to display. */
  validationError?: string | null;
  /** Optional German server error to display. */
  serverError?: string | null;
  /** Called when the user clears the validation error (e.g. on input). */
  onClearValidationError?: () => void;
  /** Called when the user clears the server error. */
  onClearServerError?: () => void;
}

/**
 * Member Form — a reusable form for adding or editing a family member.
 *
 * Fields:
 * - Name (required) — always visible
 * - Role, Birthdate, Avatar color (optional) — behind a "Weitere Angaben"
 *   toggle, shown by default when any optional field has a pre-filled value
 *
 * Used in the family management page's add and edit bottom sheets.
 */
export function MemberForm({
  initialValues,
  submitLabel,
  onSubmit,
  isSubmitting = false,
  validationError,
  serverError,
  onClearValidationError,
  onClearServerError,
}: MemberFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [role, setRole] = useState(initialValues?.role ?? "");
  const [birthdate, setBirthdate] = useState(initialValues?.birthdate ?? "");
  const [avatarColor, setAvatarColor] = useState(
    initialValues?.avatar_color ?? "",
  );
  const [showOptional, setShowOptional] = useState(() => {
    // Show optional fields by default when editing a member that has values.
    return Boolean(
      initialValues?.role ||
        initialValues?.birthdate ||
        initialValues?.avatar_color,
    );
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input on mount.
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ name, role, birthdate, avatar_color: avatarColor });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (validationError) onClearValidationError?.();
    if (serverError) onClearServerError?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Name (required) */}
      <div className="space-y-2">
        <Label htmlFor="member-name">Name</Label>
        <Input
          ref={nameInputRef}
          id="member-name"
          type="text"
          autoComplete="off"
          placeholder="z. B. Emma"
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

      {/* Optional fields toggle */}
      <button
        type="button"
        onClick={() => setShowOptional((s) => !s)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {showOptional ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        Weitere Angaben (optional)
      </button>

      {showOptional && (
        <div className="space-y-3 rounded-ordilo-md bg-secondary/50 p-3">
          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="member-role">Rolle</Label>
            <Input
              id="member-role"
              type="text"
              autoComplete="off"
              placeholder="z. B. Vater, Mutter, Kind"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSubmitting}
              className="h-11 rounded-ordilo-md"
            />
          </div>

          {/* Birthdate */}
          <div className="space-y-2">
            <Label htmlFor="member-birthdate">Geburtsdatum</Label>
            <Input
              id="member-birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              disabled={isSubmitting}
              className="h-11 rounded-ordilo-md"
            />
          </div>

          {/* Avatar color */}
          <div className="space-y-2">
            <Label>Farbe</Label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() =>
                    setAvatarColor(avatarColor === color ? "" : color)
                  }
                  className={cn(
                    "size-9 rounded-full transition-all",
                    avatarColor === color
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "ring-1 ring-border",
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Farbe ${color} auswählen`}
                  aria-pressed={avatarColor === color}
                  disabled={isSubmitting}
                />
              ))}
            </div>
          </div>
        </div>
      )}

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
