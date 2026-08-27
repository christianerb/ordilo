"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVATAR_COLORS } from "@/lib/schemas/onboarding";
import {
  RelationshipList,
  type RelationMemberOption,
} from "@/components/ordilo/relationship-list";
import { MemberPhotoPicker } from "@/components/ordilo/member-photo-picker";
import { DateInput } from "@/components/ordilo/date-input";
import type { MemberRelation } from "@/lib/family/relations";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { OrdiloDisclosure } from "@/components/ordilo/ordilo-disclosure";

/**
 * The form values for a member (add or edit).
 */
export interface MemberFormValues {
  name: string;
  birthdate: string;
  avatar_color: string;
  /**
   * Everything this person is, at once — "Mutter von Emma und Hanna" AND
   * "Partnerin von Christian". A relation without members is a plain role.
   */
  relations: MemberRelation[];
}

/** A minimal reference to another family member, for the relationship list. */
export type MemberOption = RelationMemberOption;

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
  /**
   * The member's own ID (edit mode only). Enables the photo upload section
   * — a brand-new member has no ID yet to scope the upload to, so photo
   * upload only becomes available once the member exists.
   */
  memberId?: string;
  /** The member's current photo (a short-lived signed URL), if any. */
  photoUrl?: string | null;
  /** Called after the photo is uploaded or removed, with the new signed URL (or null). */
  onPhotoChange?: (url: string | null) => void;
  /** Other members of the family (excluding this one), for the "von" chips. */
  otherMembers?: MemberOption[];
}

/**
 * Member Form — a reusable form for adding or editing a family member.
 *
 * Fields:
 * - Name (required) — always visible
 * - Rolle & Beziehung (optional) — always visible, right below the name.
 *   A list, because one person is several things at once ("Mutter von
 *   Emma", "Partnerin von Chris").
 * - Foto, Geburtsdatum, Avatarfarbe (optional) — behind a "Weitere
 *   Angaben" toggle, shown by default when any has a pre-filled value.
 *   Foto only renders once the member exists (edit mode).
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
  memberId,
  photoUrl,
  onPhotoChange,
  otherMembers = [],
}: MemberFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [birthdate, setBirthdate] = useState(initialValues?.birthdate ?? "");
  const [avatarColor, setAvatarColor] = useState(
    initialValues?.avatar_color ?? "",
  );
  const [relations, setRelations] = useState<MemberRelation[]>(
    initialValues?.relations ?? [],
  );
  const showOptionalInitially = Boolean(
    initialValues?.birthdate || initialValues?.avatar_color,
  );

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input on mount.
  useMountEffect(() => {
    nameInputRef.current?.focus();
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name,
      birthdate,
      avatar_color: avatarColor,
      // Half-filled rows (a person picked but no role yet) carry no
      // meaning — drop them instead of failing the save.
      relations: relations.filter((relation) => relation.role.trim() !== ""),
    });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (validationError) onClearValidationError?.();
    if (serverError) onClearServerError?.();
  };

  const relatableMembers = otherMembers.filter((m) => m.id !== memberId);

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
          maxLength={100}
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

      {/* Familienbeziehungen (optional, but always visible — not tucked
          behind a toggle). One row per person: a person is usually several
          things at once ("Mutter von Emma", "Partnerin von Chris"). */}
      <div className="space-y-2">
        <Label id="member-relations-label">Familienbeziehungen</Label>
        <div aria-labelledby="member-relations-label">
          <RelationshipList
            value={relations}
            onChange={setRelations}
            members={relatableMembers}
            subjectName={name}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <OrdiloDisclosure
        title="Weitere Angaben (optional)"
        defaultOpen={showOptionalInitially}
        className="border-t-0"
        contentClassName="space-y-4 rounded-ordilo-md bg-secondary/50 p-3"
        testId="member-optional-fields"
      >
        {/* Photo — only once the member exists */}
        {memberId && (
          <div className="space-y-2">
            <Label>Foto</Label>
            <MemberPhotoPicker
              memberId={memberId}
              memberName={name}
              avatarColor={avatarColor}
              photoUrl={photoUrl}
              onPhotoChange={onPhotoChange}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Birthdate — a text field (TT.MM.JJJJ) with a calendar popover,
            instead of the native date picker (inconsistent across
            browsers/OS and, on some platforms, no visible calendar at all). */}
        <div className="space-y-2">
          <Label htmlFor="member-birthdate">Geburtsdatum</Label>
          <DateInput
            id="member-birthdate"
            value={birthdate}
            onChange={setBirthdate}
            disabled={isSubmitting}
            aria-label="Geburtsdatum"
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
                  "size-9 rounded-full transition-shadow duration-150",
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
      </OrdiloDisclosure>

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
