"use client";

import { useState } from "react";

export function FamilyMemberRowMenu({
  onEdit,
  onRemove,
}: {
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex size-6 items-center justify-center rounded-ordilo-sm text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Aktionen"
        data-testid="person-card-actions"
      >
        <svg
          className="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-ordilo-sm border border-border bg-popover p-1 shadow-md">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 rounded-ordilo-sm px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
              data-testid="card-action-edit"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="flex w-full items-center gap-2 rounded-ordilo-sm px-2.5 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/5"
              data-testid="card-action-delete"
            >
              Entfernen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
