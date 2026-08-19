"use client";

import { UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_ACTIVE } from "@/lib/ui-styles";
import { MemberAvatar } from "@/components/ordilo/member-avatar";
import type { AssigneeOption } from "@/components/ordilo/task-card";

/**
 * "Wer macht das?" — a radiogroup of member face buttons plus a "Niemand"
 * option. Shared by the task-create and task-detail sheets so both offer
 * the same picker with the same shape.
 */
export function AssigneePicker({
  value,
  onChange,
  members,
  memberPhotoUrls = {},
  testIdPrefix,
}: {
  value: string;
  onChange: (value: string) => void;
  members: AssigneeOption[];
  memberPhotoUrls?: Record<string, string>;
  testIdPrefix: string;
}) {
  return (
    <>
      <p className="mb-2 text-sm font-medium text-foreground">
        Wer macht das?
      </p>
      <div
        role="radiogroup"
        aria-label="Wer macht das?"
        className="flex flex-wrap gap-2"
      >
        {members.map((member) => {
          const selected = value === member.id;
          return (
            <button
              key={member.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(member.id)}
              className={cn(
                "press-scale inline-flex h-11 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-medium transition-colors focus-ring",
                selected
                  ? FILTER_ACTIVE
                  : "border-border bg-[var(--surface-box)] text-foreground hover:bg-secondary",
              )}
              data-testid={`${testIdPrefix}-assignee-${member.id}`}
            >
              <MemberAvatar
                name={member.name}
                color={member.avatar_color}
                photoUrl={memberPhotoUrls[member.id]}
                size="md"
              />
              <span className="max-w-28 truncate">{member.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={value === ""}
          onClick={() => onChange("")}
          className={cn(
            "press-scale inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-ring",
            value === ""
              ? FILTER_ACTIVE
              : "border-border bg-[var(--surface-box)] text-muted-foreground hover:text-foreground",
          )}
          data-testid={`${testIdPrefix}-assignee-none`}
        >
          <UserX
            className="size-4 shrink-0"
            aria-hidden="true"
            strokeWidth={1.75}
          />
          Niemand
        </button>
      </div>
    </>
  );
}
