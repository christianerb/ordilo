import { cn } from "@/lib/utils";
import {
  getAvatarTextColor,
  resolveAvatarColor,
} from "@/lib/avatar-colors";

const SIZES = {
  sm: "size-5 text-[0.625rem]",
  md: "size-8 text-xs",
  lg: "size-9 text-sm",
} as const;

/**
 * A family member's face: their uploaded photo when there is one, their
 * colored initial when there isn't.
 *
 * Names alone read as a list of strings; a face makes "wer macht das?"
 * answerable at a glance, which is the whole point of assigning a task
 * to someone.
 */
export function MemberAvatar({
  name,
  color,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  /** The member's accent color (hex), used for the initial fallback. */
  color?: string | null;
  /** A ready-to-use image URL (signed) — omitted falls back to initials. */
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const backgroundColor = resolveAvatarColor(color);
  const textColor = getAvatarTextColor(backgroundColor);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (photoUrl) {
    return (
      // Signed storage URLs expire, so next/image's cache would eventually
      // serve a dead URL — a plain <img> is correct here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover",
          SIZES[size],
          className,
        )}
        data-testid="member-avatar-photo"
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor, color: textColor }}
      aria-hidden="true"
      data-testid="member-avatar-initial"
    >
      {initial}
    </span>
  );
}
