"use client";

import { Cake, Users } from "lucide-react";
import { getDaysUntilBirthday } from "@/lib/format";
import { getGreeting } from "@/components/ordilo/app-shell-shared";
import { MemberAvatar } from "./member-avatar";

interface FamilyBannerMember {
  id: string;
  name: string;
  birthdate: string | null;
  avatar_color: string | null;
}

export function FamilyBanner({
  familyName,
  members,
  photoUrls,
}: {
  familyName: string;
  members: FamilyBannerMember[];
  photoUrls: Record<string, string>;
}) {
  let birthdayToday = false;
  const upcomingBirthday = (() => {
    for (const member of members) {
      const days = getDaysUntilBirthday(member.birthdate);
      if (days === 0) {
        birthdayToday = true;
        return `${member.name} hat heute Geburtstag`;
      }
      if (days === 1) {
        return `${member.name} hat morgen Geburtstag`;
      }
      if (days !== null && days <= 7) {
        return `${member.name} in ${days} Tagen`;
      }
    }
    return null;
  })();

  return (
    <div className="relative overflow-hidden rounded-ordilo-md border border-border p-4 animate-card-in">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--sand)] to-[var(--sand-light)]" />
      <div
        className="absolute -top-12 -right-12 size-32 rounded-full bg-[var(--petrol)] opacity-[0.04] blur-2xl animate-banner-glow"
        aria-hidden="true"
      />

      <div className="relative flex items-center gap-3">
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {members.length === 0 ? (
            <div className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/8">
              <Users className="size-5 text-[var(--petrol)]" strokeWidth={1.75} />
            </div>
          ) : (
            <div className="flex -space-x-2">
              {members.slice(0, 3).map((member, index) => (
                <div
                  key={member.id}
                  className="animate-avatar-pop"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <MemberAvatar
                    name={member.name}
                    color={member.avatar_color}
                    photoUrl={photoUrls[member.id]}
                    sizeClass="size-9"
                    className="border-2 border-[var(--sand-light)]"
                  />
                </div>
              ))}
              {members.length > 3 && (
                <div
                  className="flex size-9 items-center justify-center rounded-full border-2 border-[var(--sand-light)] bg-[var(--mist-light)] text-xs font-medium text-[var(--mist-dark)] animate-avatar-pop"
                  style={{ animationDelay: `${Math.min(members.length, 3) * 60}ms` }}
                >
                  +{members.length - 3}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{getGreeting(new Date())},</p>
          <h1 className="truncate text-base font-semibold text-foreground">
            {familyName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {members.length === 0
              ? "Noch keine Personen"
              : members.length === 1
                ? "1 Person"
                : `${members.length} Personen`}
            {upcomingBirthday && (
              <span className="text-[var(--apricot)]">
                {" · "}
                {upcomingBirthday}
              </span>
            )}
          </p>
        </div>

        {upcomingBirthday && (
          <Cake
            className={`size-5 shrink-0 text-[var(--apricot)] ${
              birthdayToday ? "animate-sparkle-pulse" : ""
            }`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
