"use client";

import { FileText } from "lucide-react";
import { CardActions } from "@/components/ordilo/card-actions";
import { getAgeInYears } from "@/lib/format";
import type { Database } from "@/types/database";
import { isChildMember } from "./family-filters";
import { MemberAvatar } from "./member-avatar";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export function FamilyMemberCard({
  member,
  wash,
  photoUrl,
  documentCount = 0,
  onOpen,
  onEdit,
  onRemove,
}: {
  member: MemberRow;
  wash: string;
  photoUrl?: string;
  documentCount?: number;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const age = getAgeInYears(member.birthdate);
  // Age is only useful context for children (school year, size); showing a
  // parent's age isn't the point of this card. The relationship label (e.g.
  // "Ehepartnerin") takes priority over it when both would apply.
  const showAge = isChildMember(member) && !member.relationship_label && age !== null;
  const metaParts = [
    member.role,
    member.relationship_label,
    showAge ? (age === 1 ? "1 Jahr" : `${age} Jahre`) : null,
  ].filter(Boolean);
  const metaText = metaParts.join(" · ");

  return (
    <div
      className="flex flex-col gap-2 rounded-ordilo-md border border-border/50 p-3 animate-card-in"
      style={{ backgroundColor: wash }}
      data-testid="member-row"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-ordilo-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={`${member.name} öffnen`}
        >
          <MemberAvatar
            name={member.name}
            color={member.avatar_color}
            photoUrl={photoUrl}
            sizeClass="size-12"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {member.name}
            </p>
            {metaText && (
              <p className="truncate text-xs text-muted-foreground">
                {metaText}
              </p>
            )}
          </div>
        </button>

        <CardActions
          onEdit={onEdit}
          onDelete={onRemove}
          testId="person-card-actions"
        />
      </div>

      {documentCount > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          {documentCount === 1 ? "1 Dokument" : `${documentCount} Dokumente`}
        </p>
      )}
    </div>
  );
}
