"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVATAR_COLORS } from "@/lib/schemas/onboarding";
import { ACCEPTED_AVATAR_FILE_EXTENSIONS } from "@/lib/schemas/avatar";
import { RelationshipEditor } from "@/components/ordilo/relationship-editor";
import { DateInput } from "@/components/ordilo/date-input";
import type { MemberRelation } from "@/lib/family/relations";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { PhotoCropDialog } from "@/components/ordilo/photo-crop-dialog";

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

/** A minimal reference to another family member, for the relationship chips. */
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
  const [showOptional, setShowOptional] = useState(() => {
    // Show optional fields by default when editing a member that has values.
    return Boolean(initialValues?.birthdate || initialValues?.avatar_color);
  });

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
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

      {/* Rolle & Beziehung (optional, but always visible — not tucked behind
          a toggle). A list: one person is usually several things at once. */}
      <div className="space-y-2">
        <Label id="member-relations-label">Rolle & Beziehung</Label>
        {relatableMembers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mehreres möglich — z. B. Mutter von Emma und Partnerin von Chris.
          </p>
        )}
        <div aria-labelledby="member-relations-label">
          <RelationshipEditor
            value={relations}
            onChange={setRelations}
            members={relatableMembers}
            disabled={isSubmitting}
          />
        </div>
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
                      if (file) setPendingPhotoFile(file);
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
              <PhotoCropDialog
                file={pendingPhotoFile}
                onCancel={() => setPendingPhotoFile(null)}
                onConfirm={(croppedFile) => {
                  setPendingPhotoFile(null);
                  void handlePhotoSelected(croppedFile);
                }}
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
