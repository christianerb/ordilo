"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVATAR_COLORS } from "@/lib/schemas/onboarding";
import { ACCEPTED_AVATAR_FILE_EXTENSIONS } from "@/lib/schemas/avatar";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Common relationship/role suggestions offered via a datalist. Free text
 * is still accepted — these are just discoverable starting points.
 */
const ROLE_SUGGESTIONS = [
  "Vater",
  "Mutter",
  "Kind",
  "Partner:in",
  "Großvater",
  "Großmutter",
  "Bruder",
  "Schwester",
];

/**
 * The form values for a member (add or edit).
 */
export interface MemberFormValues {
  name: string;
  role: string;
  birthdate: string;
  avatar_color: string;
  related_member_id: string;
  relationship_label: string;
}

/** A minimal reference to another family member, for the "Beziehung zu" select. */
export interface MemberOption {
  id: string;
  name: string;
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
  /** Other members of the family (excluding this one), for "Beziehung zu". */
  otherMembers?: MemberOption[];
}

/**
 * Member Form — a reusable form for adding or editing a family member.
 *
 * Fields:
 * - Name (required) — always visible
 * - Rolle (optional) — always visible, right below the name
 * - Foto, Geburtsdatum, Beziehung, Avatarfarbe (optional) — behind a
 *   "Weitere Angaben" toggle, shown by default when any has a pre-filled
 *   value. Foto only renders once the member exists (edit mode).
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
  const [role, setRole] = useState(initialValues?.role ?? "");
  const [birthdate, setBirthdate] = useState(initialValues?.birthdate ?? "");
  const [avatarColor, setAvatarColor] = useState(
    initialValues?.avatar_color ?? "",
  );
  const [relatedMemberId, setRelatedMemberId] = useState(
    initialValues?.related_member_id ?? "",
  );
  const [relationshipLabel, setRelationshipLabel] = useState(
    initialValues?.relationship_label ?? "",
  );
  const [showOptional, setShowOptional] = useState(() => {
    // Show optional fields by default when editing a member that has values.
    return Boolean(
      initialValues?.birthdate ||
        initialValues?.avatar_color ||
        initialValues?.related_member_id ||
        initialValues?.relationship_label,
    );
  });

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input on mount.
  useMountEffect(() => {
    nameInputRef.current?.focus();
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name,
      role,
      birthdate,
      avatar_color: avatarColor,
      related_member_id: relatedMemberId,
      relationship_label: relationshipLabel,
    });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (validationError) onClearValidationError?.();
    if (serverError) onClearServerError?.();
  };

  const handlePhotoSelected = useCallback(
    async (file: File) => {
      if (!memberId) return;
      setPhotoError(null);
      setPhotoUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`/api/family-members/${memberId}/photo`, {
          method: "POST",
          body: formData,
        });
        const body = await response.json();
        if (!response.ok) {
          setPhotoError(body.error ?? "Foto konnte nicht hochgeladen werden.");
          return;
        }
        onPhotoChange?.(body.url as string);
      } catch {
        setPhotoError("Foto konnte nicht hochgeladen werden. Bitte erneut versuchen.");
      } finally {
        setPhotoUploading(false);
      }
    },
    [memberId, onPhotoChange],
  );

  const handleRemovePhoto = useCallback(async () => {
    if (!memberId) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const response = await fetch(`/api/family-members/${memberId}/photo`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json();
        setPhotoError(body.error ?? "Foto konnte nicht entfernt werden.");
        return;
      }
      onPhotoChange?.(null);
    } catch {
      setPhotoError("Foto konnte nicht entfernt werden. Bitte erneut versuchen.");
    } finally {
      setPhotoUploading(false);
    }
  }, [memberId, onPhotoChange]);

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

      {/* Rolle (optional, but always visible — not tucked behind a toggle) */}
      <div className="space-y-2">
        <Label htmlFor="member-role">Rolle</Label>
        <Input
          id="member-role"
          type="text"
          autoComplete="off"
          list="member-role-suggestions"
          placeholder="z. B. Vater, Mutter, Kind"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isSubmitting}
          className="h-11 rounded-ordilo-md"
        />
        <datalist id="member-role-suggestions">
          {ROLE_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
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
        <div className="space-y-4 rounded-ordilo-md bg-secondary/50 p-3">
          {/* Photo — only once the member exists */}
          {memberId && (
            <div className="space-y-2">
              <Label>Foto</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading || isSubmitting}
                    className="group relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-[var(--sand-warm)] ring-1 ring-border"
                    aria-label={photoUrl ? "Foto ändern" : "Foto hochladen"}
                    data-testid="member-photo-button"
                  >
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Camera className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="size-5 text-white" strokeWidth={1.75} />
                    </span>
                    {photoUploading && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="size-5 animate-spin text-white" />
                      </span>
                    )}
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept={ACCEPTED_AVATAR_FILE_EXTENSIONS}
                    className="hidden"
                    data-testid="member-photo-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handlePhotoSelected(file);
                    }}
                  />
                </div>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={photoUploading || isSubmitting}
                    className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
                    data-testid="member-photo-remove"
                  >
                    <X className="size-3.5" />
                    Entfernen
                  </button>
                )}
              </div>
              {photoError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {photoError}
                </p>
              )}
            </div>
          )}

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

          {/* Beziehung — reference to another family member */}
          {relatableMembers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="member-related">Beziehung zu</Label>
              <select
                id="member-related"
                value={relatedMemberId}
                onChange={(e) => setRelatedMemberId(e.target.value)}
                disabled={isSubmitting}
                className="h-11 w-full appearance-none rounded-ordilo-md border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Keine Auswahl</option>
                {relatableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {relatedMemberId && (
                <Input
                  type="text"
                  autoComplete="off"
                  placeholder="Art der Beziehung, z. B. Ehepartner, Bruder"
                  value={relationshipLabel}
                  onChange={(e) => setRelationshipLabel(e.target.value)}
                  disabled={isSubmitting}
                  className="h-11 rounded-ordilo-md"
                  data-testid="member-relationship-label"
                />
              )}
            </div>
          )}

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
