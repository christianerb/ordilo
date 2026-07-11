"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Loader2, Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createFamilyInvite } from "@/app/(app)/familie/actions";

/**
 * Invite card — lets the family owner create and share an invite link.
 *
 * One tap creates the link; sharing uses the system share sheet where
 * available (mobile) and falls back to copy-to-clipboard. The link is
 * valid for 14 days and can be used by several people.
 */
export function InviteCard({ className }: { className?: string }) {
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
    <div
      data-testid="invite-card"
      className={`rounded-ordilo-sm border border-border bg-card p-4 ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--sand)]/80">
          <UserPlus className="size-4 text-[var(--petrol)]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Familie einladen
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Teile einen Link, damit dein Partner oder deine Partnerin alle
            Dokumente mitnutzen kann.
          </p>

          {!inviteUrl && (
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="mt-3 rounded-ordilo-sm"
              data-testid="create-invite-button"
            >
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Wird erstellt …
                </>
              ) : (
                <>
                  <Share2 className="size-4" aria-hidden="true" />
                  Einladungslink erstellen
                </>
              )}
            </Button>
          )}

          {inviteUrl && (
            <div className="mt-3 space-y-2 animate-card-in">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.target.select()}
                  aria-label="Einladungslink"
                  data-testid="invite-link-input"
                  className="min-w-0 flex-1 truncate rounded-ordilo-sm border border-border bg-[var(--sand-light)] px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0 rounded-ordilo-sm"
                  data-testid="copy-invite-button"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Kopiert
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden="true" />
                      Kopieren
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Der Link ist 14 Tage gültig und kann von mehreren Personen
                genutzt werden.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
