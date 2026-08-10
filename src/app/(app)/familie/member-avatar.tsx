"use client";

import {
  getAvatarTextColor,
  resolveAvatarColor,
} from "@/lib/avatar-colors";

export function MemberAvatar({
  name,
  color,
  photoUrl,
  sizeClass,
  className = "",
}: {
  name: string;
  color: string | null;
  photoUrl?: string;
  sizeClass: string;
  className?: string;
}) {
  const avatarColor = resolveAvatarColor(color);

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        aria-hidden="true"
        className={`flex ${sizeClass} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full text-xs font-semibold ${className}`}
      style={{
        backgroundColor: avatarColor,
        color: getAvatarTextColor(avatarColor),
      }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
