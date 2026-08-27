"use client";

import { useRef, useState } from "react";
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
   * together with `onCreate`, a one-tap "<name> anlegen" suggestion chip
   * is offered alongside the always-available free-text create form.
   */
  createName?: string | null;
  /** Creates a family member with the given name. Resolves false on failure. */
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
 * Four kinds of chip, because a document does not always belong to a
 * known family member:
 *   - one per family member (the assigned one is filled with a check)
 *   - "Ohne Person" for documents that belong to nobody — forcing a wrong
 *     assignment just to get past the review would poison the family book
 *   - "<name> anlegen" when the extraction found a person the family does
 *     not have yet — one tap and they exist
 *   - "Neue Person" for everyone else: opens a small inline name field so
 *     any person can join the family without leaving the review (the old
 *     dead end: "die Person gibt es noch nicht, also komme ich nicht
 *     weiter")
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
  const [formOpen, setFormOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const newPersonChipRef = useRef<HTMLButtonElement>(null);

  /**
   * IDs present on first render. A chip whose ID appears later (i.e. the
   * member was just created from this picker) enters with a gentle
   * card-in animation — the small "welcome to the family" moment.
   * Chips present at mount never animate, so reopening the picker does
   * not replay anything.
   */
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(familyMembers.map((m) => m.id));
  }
  const initialIds = initialIdsRef.current;

  // Without members and without any way to create one there is nothing
  // to offer — render nothing rather than an empty group.
  if (familyMembers.length === 0 && !onCreate) return null;

  const explicitNone = value === null;

  const closeForm = () => {
    setFormOpen(false);
    setDraftName("");
    setCreateFailed(false);
    // The trigger unmounts the form under the user's focus — return it to
    // the "Neue Person" chip so keyboard users are not dropped on <body>.
    requestAnimationFrame(() => newPersonChipRef.current?.focus());
  };

  const submitCreate = async () => {
    const name = draftName.trim();
    if (!name || submitting || !onCreate) return;
    setSubmitting(true);
    setCreateFailed(false);
    // A rejected promise here (offline, server action throw) must not
    // become an unhandled rejection — the tap would look like a no-op.
    const ok = await onCreate(name).catch(() => false);
    setSubmitting(false);
    if (ok) {
      closeForm();
    } else {
      setCreateFailed(true);
    }
  };

  return (
    <div
      role="group"
      aria-label="Person zuordnen"
      className={cn("flex flex-col gap-2", className)}
      data-testid={`${testIdPrefix}-picker`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
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
                "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 focus-ring",
                // Freshly created members get a one-time entrance.
                !initialIds.has(member.id) && "animate-card-in",
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
                  // Mounts on selection, so the pop plays exactly once per
                  // assignment — a quiet "noted" instead of a fanfare.
                  <Check className="size-3.5 animate-check-pop" strokeWidth={3} />
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
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 focus-ring",
            explicitNone
              ? "border-[var(--mist-dark)] bg-[var(--mist-dark)] text-white"
              : "border-dashed border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          )}
        >
          {explicitNone && (
            <Check
              className="size-3.5 animate-check-pop"
              strokeWidth={3}
              aria-hidden="true"
            />
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
              const ok = await onCreate(createName).catch(() => false);
              setCreating(false);
              setCreateFailed(!ok);
            }}
            data-testid={`${testIdPrefix}-chip-create`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-[var(--petrol)]/50 bg-transparent px-3 py-1 text-sm font-medium text-[var(--petrol)] transition-[background-color,box-shadow,opacity] duration-150 hover:bg-[var(--petrol)]/5 focus-ring disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{createName} anlegen</span>
          </button>
        )}

        {onCreate && !formOpen && (
          <button
            ref={newPersonChipRef}
            type="button"
            onClick={() => {
              setCreateFailed(false);
              setFormOpen(true);
            }}
            data-testid={`${testIdPrefix}-chip-new`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3 py-1 text-sm font-medium text-muted-foreground transition-[border-color,color,box-shadow] duration-150 hover:border-[var(--petrol)]/50 hover:text-[var(--petrol)] focus-ring"
          >
            <Plus className="size-3.5 shrink-0" aria-hidden="true" />
            Neue Person
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            data-testid={`${testIdPrefix}-chip-dismiss`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
            Abbrechen
          </button>
        )}
      </div>

      {formOpen && onCreate && (
        <form
          className="flex w-full animate-card-in items-center gap-1.5"
          data-testid={`${testIdPrefix}-create-form`}
          onSubmit={(e) => {
            e.preventDefault();
            void submitCreate();
          }}
        >
          <input
            type="text"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeForm();
              }
            }}
            placeholder="Name der Person"
            aria-label="Name der neuen Person"
            maxLength={100}
            enterKeyHint="done"
            autoComplete="off"
            disabled={submitting}
            data-testid={`${testIdPrefix}-create-input`}
            className="h-11 min-w-0 flex-1 rounded-full border border-[var(--petrol)]/50 bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus-ring disabled:opacity-60 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!draftName.trim() || submitting}
            aria-busy={submitting}
            data-testid={`${testIdPrefix}-create-submit`}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--petrol)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-ring disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
            )}
            Anlegen
          </button>
          <button
            type="button"
            onClick={closeForm}
            aria-label="Anlegen abbrechen"
            data-testid={`${testIdPrefix}-create-cancel`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </form>
      )}

      {createFailed && (
        <p
          role="status"
          className="text-xs text-destructive"
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
