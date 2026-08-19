"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createFamilyInvite } from "@/app/(app)/familie/actions";
import { OrdiloActionSwap } from "@/components/ordilo/ordilo-action-swap";

/**
 * Invite action — a compact button inside the family banner that creates
 * and shares an invite link. Replaces the former standalone invite card,
 * which took up a full screen section for a single action.
 *
 * One tap creates the link; sharing uses the system share sheet where
 * available (mobile) and falls back to copy-to-clipboard. The link is
 * valid for 14 days and can be used by several people.
 *
 * The component renders a fragment: the button sits in the banner's
 * header row, and once a link exists, the copy panel wraps below the row
 * (the banner uses flex-wrap) with an internal divider — one grouped
 * surface instead of two stacked cards.
 */
export function InviteAction() {
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    const result = await createFamilyInvite();
    setCreating(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    const url = `${window.location.origin}/invite/${result.data.token}`;
    setInviteUrl(url);

    // Mobile: open the system share sheet directly — one tap from
    // "create" to "sent via WhatsApp". Desktop falls back to the copy UI.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Ordilo — Familieneinladung",
          text: "Komm in unseren Ordilo-Familienordner:",
          url,
        });
      } catch {
        // Share cancelled — the link UI below stays visible.
      }
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the user can select the text manually.
    }
  }, [inviteUrl]);

  return (
    <>
      {!inviteUrl && (
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          disabled={creating}
          className="shrink-0 rounded-ordilo-sm"
          data-testid="create-invite-button"
        >
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Wird erstellt …
            </>
          ) : (
            <>
              <UserPlus className="size-4" aria-hidden="true" />
              Einladen
            </>
          )}
        </Button>
      )}

      {(inviteUrl || error) && (
        <div
          className="w-full space-y-2 border-t border-border/60 pt-3 animate-card-in"
          data-testid="invite-link-panel"
        >
          {inviteUrl && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.target.select()}
                  aria-label="Einladungslink"
                  data-testid="invite-link-input"
                  className="min-w-0 flex-1 truncate rounded-ordilo-sm border border-border bg-[var(--warm-white)]/70 px-2.5 py-1.5 text-xs text-foreground focus-ring"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0 rounded-ordilo-sm"
                  data-testid="copy-invite-button"
                >
                  <OrdiloActionSwap
                    active={copied}
                    idleLabel="Kopieren"
                    activeLabel="Kopiert"
                    IdleIcon={Copy}
                    ActiveIcon={Check}
                  />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Der Link ist 14 Tage gültig und kann von mehreren Personen
                genutzt werden.
              </p>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
