"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FamilyMemberOption } from "@/lib/analysis";

export interface PersonPickerProps {
  /** All family members, each rendered as a tappable chip. */
  familyMembers: FamilyMemberOption[];
  /**
   * Assigned member ID, `null` for "explicitly nobody" (the Ohne-Person
   * chip is then filled), or `undefined` when nothing is assigned yet —
   * an unlinked extraction must not look like a deliberate "nobody".
   */
  value: string | null | undefined;
  /** Called with a member ID, or null when "Ohne Person" is tapped. */
  onChange: (memberId: string | null) => void;
  /**
   * Name of an extracted person who matches no family member. When set
   * together with `onCreate`, a "<name> anlegen" chip is offered.
   */
  createName?: string | null;
  /** Creates `createName` as a family member. Resolves false on failure. */
  onCreate?: (name: string) => Promise<boolean>;
  /**
   * Closes the picker without changing anything. When set, tapping the
   * already-assigned chip also closes (it reads as "yes, that one") and an
   * explicit Abbrechen chip is offered. Without this the picker has no exit
   * for a user who opened it only to check.
   */
  onDismiss?: () => void;
  /**
   * Prefix for the chips' data-testids, e.g. "review-summary-person"
   * yields "review-summary-person-chip-<id>" / "-chip-none" / "-chip-create".
   */
  testIdPrefix: string;
  className?: string;
}

/**
 * Person assignment as a row of chips — one tap to assign, no dropdown to
 * open first. Families are small enough that every option fits on screen,
 * which is what makes the single tap possible.
 *
 * Three kinds of chip, because a document does not always belong to a
 * known family member:
 *   - one per family member (the assigned one is filled with a check)
 *   - "Ohne Person" for documents that belong to nobody — forcing a wrong
 *     assignment just to get past the review would poison the family book
 *   - "<name> anlegen" when the extraction found a person the family does
 *     not have yet, so the member can be created without leaving the review
 */
export function PersonPicker({
  familyMembers,
  value,
  onChange,
  createName,
  onCreate,
  onDismiss,
  testIdPrefix,
  className,
}: PersonPickerProps) {
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  if (familyMembers.length === 0 && !(createName && onCreate)) return null;

  const explicitNone = value === null;

  return (
    <div
      role="group"
      aria-label="Person zuordnen"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      data-testid={`${testIdPrefix}-picker`}
    >
      {familyMembers.map((member) => {
        const selected = member.id === value;
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => {
              if (selected) onDismiss?.();
              else onChange(member.id);
            }}
            aria-pressed={selected}
            data-testid={`${testIdPrefix}-chip-${member.id}`}
            className={cn(
              "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
                : "border-border bg-card text-foreground hover:border-[var(--petrol)] hover:bg-[var(--petrol)]/5",
            )}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                selected ? "bg-white/25 text-white" : "bg-[var(--petrol)] text-white",
              )}
              aria-hidden="true"
            >
              {selected ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                member.name.charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0 truncate">{member.name}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => {
          if (explicitNone) onDismiss?.();
          else onChange(null);
        }}
        aria-pressed={explicitNone}
        data-testid={`${testIdPrefix}-chip-none`}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          explicitNone
            ? "border-[var(--mist-dark)] bg-[var(--mist-dark)] text-white"
            : "border-dashed border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        )}
      >
        {explicitNone && (
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        )}
        Ohne Person
      </button>

      {createName && onCreate && (
        <button
          type="button"
          disabled={creating}
          aria-busy={creating}
          onClick={async () => {
            setCreating(true);
            setCreateFailed(false);
            // A rejected promise here (offline, server action throw) used to
            // become an unhandled rejection and the tap looked like a no-op.
            const ok = await onCreate(createName).catch(() => false);
            setCreating(false);
            setCreateFailed(!ok);
          }}
          data-testid={`${testIdPrefix}-chip-create`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-[var(--petrol)]/50 bg-transparent px-3 py-1 text-sm font-medium text-[var(--petrol)] transition-all hover:bg-[var(--petrol)]/5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{createName} anlegen</span>
        </button>
      )}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          data-testid={`${testIdPrefix}-chip-dismiss`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-3.5" aria-hidden="true" />
          Abbrechen
        </button>
      )}

      {createFailed && (
        <p
          role="status"
          className="w-full text-xs text-destructive"
          data-testid={`${testIdPrefix}-create-error`}
        >
          Das hat nicht geklappt. Bitte nochmal versuchen.
        </p>
      )}
    </div>
  );
}

/**
 * Decide whether an extracted person warrants a "create member" offer:
 * they carry a name, the extraction linked them to nobody, and no
 * existing member shares that name.
 */
export function unmatchedPersonName(
  extractedName: string | null | undefined,
  linkedPersonId: string | null | undefined,
  familyMembers: FamilyMemberOption[],
): string | null {
  const name = (extractedName ?? "").trim();
  if (!name || linkedPersonId) return null;
  const normalized = name.toLocaleLowerCase("de");
  const known = familyMembers.some(
    (m) => m.name.trim().toLocaleLowerCase("de") === normalized,
  );
  return known ? null : name;
}
