"use client";

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
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${className}`}
      style={{ backgroundColor: color ?? "#305460" }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
