"use client";

import { Check, UserX } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { MemberAvatar } from "@/components/ordilo/member-avatar";
import type { AssigneeOption } from "@/components/ordilo/task-card";
import { cn } from "@/lib/utils";

export interface TaskAssignSheetProps {
  /** The task being assigned — null keeps the sheet inert. */
  task: { id: string; title: string; assigned_to: string | null } | null;
  members: AssigneeOption[];
  /** Signed avatar URLs by member id (photoless members show initials). */
  memberPhotoUrls?: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Commit the new assignee (null = niemand). Called once, immediately. */
  onSelect: (memberId: string | null) => void;
}

/**
 * "Wer macht das?" — reached by tapping the face on a task row.
 *
 * Assigning used to mean opening the detail sheet, finding a `<select>`,
 * and pressing save. For a family operating system, deciding who does
 * something is not a form field — it is the point of the whole screen, so
 * it gets one tap from the list and commits on the spot.
 */
export function TaskAssignSheet({
  task,
  members,
  memberPhotoUrls = {},
  open,
  onOpenChange,
  onSelect,
}: TaskAssignSheetProps) {
  const commit = (memberId: string | null) => {
    onSelect(memberId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-ordilo-md bg-[var(--surface-box)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        showCloseButton={false}
        data-testid="task-assign-sheet"
      >
        <SheetHeader className="px-0 pt-1 pb-3">
          <SheetTitle className="text-base font-semibold">
            Wer macht das?
          </SheetTitle>
          <SheetDescription className="truncate text-sm">
            {task?.title ?? ""}
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-1 max-h-[50vh] overflow-y-auto px-1 pb-1">
          {members.map((member) => {
            const selected = task?.assigned_to === member.id;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => commit(member.id)}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-ordilo-sm px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected
                    ? "bg-[var(--petrol)]/10"
                    : "hover:bg-secondary",
                )}
                data-testid={`task-assign-${member.id}`}
              >
                <MemberAvatar
                  name={member.name}
                  color={member.avatar_color}
                  photoUrl={memberPhotoUrls[member.id]}
                  size="lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {member.name}
                  </span>
                  {member.role && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.role}
                    </span>
                  )}
                </span>
                {selected && (
                  <Check
                    className="size-4.5 shrink-0 text-[var(--petrol)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => commit(null)}
            aria-pressed={task?.assigned_to === null}
            className="mt-1 flex min-h-14 w-full items-center gap-3 rounded-ordilo-sm px-3 text-left text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="task-assign-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--mist)]">
              <UserX className="size-4" aria-hidden="true" strokeWidth={1.75} />
            </span>
            <span className="text-sm">Niemand</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
