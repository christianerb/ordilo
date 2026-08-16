"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_AVATAR_FILE_EXTENSIONS } from "@/lib/schemas/avatar";
import { getAvatarTextColor, resolveAvatarColor } from "@/lib/avatar-colors";
import { PhotoCropDialog } from "@/components/ordilo/photo-crop-dialog";

export interface MemberPhotoPickerProps {
  /** The member the photo belongs to. Uploading needs an existing member. */
  memberId: string;
  /** The member's name — its initial fills the circle while there is no photo. */
  memberName?: string;
  /** The avatar color behind the initial. */
  avatarColor?: string | null;
  /** The current photo (a short-lived signed URL), if any. */
  photoUrl?: string | null;
  /** Called after the photo was uploaded or removed. */
  onPhotoChange?: (url: string | null) => void;
  /** Disables the picker (e.g. while the form is submitting). */
  disabled?: boolean;
  /** `sm` for the compact form row, `lg` for the centered profile header. */
  size?: "sm" | "lg";
}

/**
 * Member Photo Picker — tap the avatar, crop, upload.
 *
 * One camera affordance, not two: the circle shows the photo (or the
 * person's initial, the same avatar the rest of the app draws), and a
 * single badge says what a tap does. "Foto entfernen" only appears once
 * there is a photo to remove.
 */
export function MemberPhotoPicker({
  memberId,
  memberName = "",
  avatarColor,
  photoUrl,
  onPhotoChange,
  disabled = false,
  size = "sm",
}: MemberPhotoPickerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`/api/family-members/${memberId}/photo`, {
          method: "POST",
          body: formData,
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "Foto konnte nicht hochgeladen werden.");
          return;
        }
        onPhotoChange?.(body.url as string);
      } catch {
        setError("Foto konnte nicht hochgeladen werden. Bitte erneut versuchen.");
      } finally {
        setUploading(false);
      }
    },
    [memberId, onPhotoChange],
  );

  const remove = useCallback(async () => {
    setError(null);
    setUploading(true);
    try {
      const response = await fetch(`/api/family-members/${memberId}/photo`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "Foto konnte nicht entfernt werden.");
        return;
      }
      onPhotoChange?.(null);
    } catch {
      setError("Foto konnte nicht entfernt werden. Bitte erneut versuchen.");
    } finally {
      setUploading(false);
    }
  }, [memberId, onPhotoChange]);

  const isLarge = size === "lg";
  const initial = memberName.trim().charAt(0).toUpperCase();
  const circleColor = initial ? resolveAvatarColor(avatarColor ?? null) : undefined;
  const textColor = circleColor ? getAvatarTextColor(circleColor) : undefined;

  return (
    <div className={cn(isLarge ? "flex flex-col items-center gap-2" : "space-y-2")}>
      <div className={cn("flex items-center gap-3", isLarge && "flex-col")}>
        <div className="relative">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || disabled}
            className={cn(
              "group relative flex items-center justify-center overflow-hidden rounded-full ring-1 ring-border",
              !circleColor && "bg-[var(--sand-warm)]",
              isLarge ? "size-24" : "size-16",
            )}
            style={circleColor ? { backgroundColor: circleColor } : undefined}
            aria-label={photoUrl ? "Foto ändern" : "Foto hochladen"}
            data-testid="member-photo-button"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : initial ? (
              <span
                className={cn(
                  "font-semibold",
                  isLarge ? "text-3xl" : "text-xl",
                )}
                style={{ color: textColor }}
              >
                {initial}
              </span>
            ) : (
              <Camera
                className={cn("text-muted-foreground", isLarge ? "size-8" : "size-6")}
                strokeWidth={1.5}
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="size-5 text-white" strokeWidth={1.75} />
            </span>
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-5 animate-spin text-white" />
              </span>
            )}
          </button>
          {isLarge && (
            <span
              className="pointer-events-none absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border border-border bg-card shadow-sm"
              aria-hidden="true"
            >
              <Camera className="size-4 text-[var(--petrol)]" strokeWidth={1.75} />
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_AVATAR_FILE_EXTENSIONS}
            className="hidden"
            data-testid="member-photo-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setPendingFile(file);
            }}
          />
        </div>
        {isLarge && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || disabled}
            className="flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="member-photo-change"
          >
            <Camera className="size-4" aria-hidden="true" />
            {photoUrl ? "Foto ändern" : "Foto hinzufügen"}
          </button>
        )}
        {photoUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={uploading || disabled}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
            data-testid="member-photo-remove"
          >
            <X className="size-3.5" />
            Foto entfernen
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <PhotoCropDialog
        file={pendingFile}
        onCancel={() => setPendingFile(null)}
        onConfirm={(croppedFile) => {
          setPendingFile(null);
          void upload(croppedFile);
        }}
      />
    </div>
  );
}
