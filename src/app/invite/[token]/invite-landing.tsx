"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Heart, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { requestInviteSignIn } from "../actions";

/**
 * Invite landing card — the signed-out view of `/invite/[token]`.
 *
 * States:
 *   - "valid": shows the family name + a one-field email form. Submitting
 *     sends a login code; after verification the invite page joins the user
 *     directly to the family.
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
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
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

  const handleVerify = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const loginCode = code.trim();
      if (!/^\d{6}$/.test(loginCode)) {
        setError("Bitte gib den 6-stelligen Code ein.");
        return;
      }

      setVerifying(true);
      setError(null);
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: loginCode,
        type: "email",
      });
      setVerifying(false);

      if (verifyError) {
        setError("Der Code ist nicht gültig oder abgelaufen. Bitte hol dir einen neuen.");
        return;
      }

      window.location.assign(`/invite/${token}`);
    },
    [code, email, token],
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--warm-white)] px-5 py-10">
      <div
        className="w-full max-w-sm rounded-ordilo-md border border-border bg-card p-6 shadow-card animate-card-in"
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
              Gib deine E-Mail-Adresse ein. Du bekommst einen Anmelde-Code.
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
              Wir haben dir einen 6-stelligen Anmelde-Code geschickt.
            </p>
            <form onSubmit={handleVerify} className="mt-5 space-y-3 text-left">
              <label className="text-sm font-medium text-foreground" htmlFor="invite-code">
                Anmelde-Code
              </label>
              <input
                autoFocus
                id="invite-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                disabled={verifying}
                className="w-full rounded-ordilo-md border border-border bg-card px-3.5 py-2.5 text-center text-lg tracking-[0.3em] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={verifying}
                className="h-12 w-full rounded-ordilo-md"
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Wird geprüft …
                  </>
                ) : (
                  "Familie beitreten"
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
