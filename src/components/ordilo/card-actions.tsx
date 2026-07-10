"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * CardActions — a shared "..." menu for all card types (documents, tasks,
 * family members). Provides consistent edit and delete actions across
 * desktop, tablet, and mobile.
 *
 * - Always visible (not hover-only) so touch devices can access it
 * - 28px button target (size-7) — compact but tappable
 * - stopPropagation on click so it doesn't trigger the card's onClick
 * - Delete shows a confirmation dialog (handled by the parent via onDelete)
 */
export function CardActions({
  onEdit,
  onDelete,
  className,
  testId,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
  testId?: string;
}) {
  if (!onEdit && !onDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
          aria-label="Aktionen"
          data-testid={testId ?? "card-actions-trigger"}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <DropdownMenuItem onClick={onEdit} data-testid="card-action-edit">
            <Pencil className="size-4" aria-hidden="true" />
            Bearbeiten
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
            data-testid="card-action-delete"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Löschen
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
