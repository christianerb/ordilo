"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Heart, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestInviteSignIn } from "../actions";

/**
 * Invite landing card — the signed-out view of `/invite/[token]`.
 *
 * States:
 *   - "valid": shows the family name + a one-field email form. Submitting
 *     sends the magic link; the auth callback joins the family
 *     automatically, so the invited person never sees onboarding.
 *   - "invalid": expired/revoked/unknown token.
 *   - "already_in_family": the signed-in user already belongs to another
 *     family (one family per account for now).
 */
export function InviteLanding({
  token,
  familyName,
  state,
}: {
  token: string;
  familyName: string | null;
  state: "valid" | "invalid" | "already_in_family";
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      const result = await requestInviteSignIn(
        email,
        token,
        window.location.origin,
      );
      setSubmitting(false);

      if (!result.success) {
        setError(result.error);
        return;
      }
      setSent(true);
    },
    [email, token, submitting],
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--warm-white)] px-5 py-10">
      <div
        className="w-full max-w-sm rounded-ordilo-md border border-border bg-card p-6 shadow-card"
        data-testid="invite-landing"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--sand)]/80">
          <Heart className="size-5 text-[var(--petrol)]" aria-hidden="true" />
        </div>

        {state === "invalid" && (
          <div className="mt-4 text-center" data-testid="invite-invalid">
            <h1 className="text-lg font-semibold text-foreground">
              Diese Einladung ist nicht mehr gültig
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Der Link ist abgelaufen oder wurde zurückgezogen. Bitte lass dir
              einen neuen Link schicken.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full rounded-ordilo-md">
              <Link href="/login">Zur Anmeldung</Link>
            </Button>
          </div>
        )}

        {state === "already_in_family" && (
          <div className="mt-4 text-center" data-testid="invite-already-in-family">
            <h1 className="text-lg font-semibold text-foreground">
              Du bist schon in einer Familie
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ein Konto kann im Moment nur zu einer Familie gehören. Melde dich
              mit einer anderen E-Mail-Adresse an, um dieser Familie
              beizutreten.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full rounded-ordilo-md">
              <Link href="/home">Zurück zu meiner Familie</Link>
            </Button>
          </div>
        )}

        {state === "valid" && !sent && (
          <div className="mt-4" data-testid="invite-valid">
            <h1 className="text-center text-lg font-semibold text-foreground">
              {familyName
                ? `Du bist eingeladen zu „${familyName}“`
                : "Du bist eingeladen"}
            </h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Gib deine E-Mail-Adresse ein. Du bekommst einen Anmelde-Link —
              ein Klick, und du bist dabei.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
                autoComplete="email"
                aria-label="E-Mail-Adresse"
                data-testid="invite-email-input"
                className="w-full rounded-ordilo-md border border-border bg-card px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <Button
                type="submit"
                size="lg"
                disabled={submitting || !email.trim()}
                className="h-12 w-full rounded-ordilo-md"
                data-testid="invite-submit-button"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Wird gesendet …
                  </>
                ) : (
                  "Familie beitreten"
                )}
              </Button>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        )}

        {state === "valid" && sent && (
          <div className="mt-4 text-center" data-testid="invite-email-sent">
            <MailCheck
              className="mx-auto size-6 text-[var(--petrol)]"
              aria-hidden="true"
            />
            <h1 className="mt-3 text-lg font-semibold text-foreground">
              Schau in dein Postfach
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Wir haben dir einen Anmelde-Link geschickt. Ein Klick darauf, und
              du bist Teil der Familie.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
