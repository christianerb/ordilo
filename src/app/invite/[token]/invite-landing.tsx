"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Heart,
  Loader2,
  Mail,
  MailCheck,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateLoginEmail } from "@/lib/auth/validation";
import { webmailFor } from "@/lib/auth/webmail";
import { requestInviteSignIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/ordilo/auth-shell";

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
 *
 * The visual shell matches the login screen (AuthShell with story panel,
 * background shapes, mascot) so the first touchpoint feels like Ordilo.
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
  const [focusedCodeIndex, setFocusedCodeIndex] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const loginRequestInFlightRef = useRef(false);
  const resendRequestInFlightRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const RESEND_COOLDOWN_SECONDS = 30;

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const sendInviteCode = useCallback(
    async (targetEmail: string) => {
      const result = await requestInviteSignIn(targetEmail, token);
      return result.success;
    },
    [token],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginRequestInFlightRef.current) return;

    const result = validateLoginEmail(email);
    if (!result.success) {
      setValidationError(result.error);
      return;
    }

    setValidationError(null);
    setErrorMessage(null);
    setSubmitting(true);
    loginRequestInFlightRef.current = true;

    const ok = await sendInviteCode(result.data.email);
    if (!ok) {
      loginRequestInFlightRef.current = false;
      setSubmitting(false);
      setErrorMessage("Das hat nicht geklappt. Bitte versuch's nochmal.");
      return;
    }

    setEmail(result.data.email);
    setSent(true);
    setSubmitting(false);
    startCooldown();
  }

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || resending || resendRequestInFlightRef.current) return;
    resendRequestInFlightRef.current = true;
    setResending(true);
    const ok = await sendInviteCode(email);
    resendRequestInFlightRef.current = false;
    setResending(false);
    if (!ok) {
      setErrorMessage("Der Code konnte nicht gesendet werden. Bitte versuch's nochmal.");
      return;
    }
    setCode("");
    setErrorMessage(null);
    codeInputRefs.current[0]?.focus();
    startCooldown();
  }, [email, resendCooldown, resending, sendInviteCode, startCooldown]);

  function handleCodeChange(value: string, index: number) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    if (!digits) {
      setCode((current) => {
        const next = current.padEnd(6, " ").split("");
        next[index] = " ";
        return next.join("").trimEnd();
      });
      return;
    }

    setCode((current) => {
      const next = current.padEnd(6, " ").split("");
      digits.split("").forEach((digit, offset) => {
        if (index + offset < 6) next[index + offset] = digit;
      });
      return next.join("").trimEnd();
    });

    const nextIndex = Math.min(index + digits.length, 5);
    codeInputRefs.current[nextIndex]?.focus();
  }

  function handleCodeKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const loginCode = code.trim();
    if (!/^\d{6}$/.test(loginCode)) {
      setErrorMessage("Bitte gib den 6-stelligen Code ein.");
      return;
    }

    setErrorMessage(null);
    setVerifying(true);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: loginCode,
      type: "email",
    });
    setVerifying(false);

    if (verifyError) {
      setErrorMessage("Der Code ist nicht gültig oder abgelaufen. Bitte hol dir einen neuen.");
      return;
    }

    window.location.assign(`/invite/${token}`);
  }

  const handleChangeEmail = useCallback(() => {
    loginRequestInFlightRef.current = false;
    setSent(false);
    setCode("");
    setErrorMessage(null);
  }, []);

  function handleEmailChange(event: React.ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    if (validationError) setValidationError(null);
    if (errorMessage) setErrorMessage(null);
  }

  // ---------------------------------------------------------------------------
  // Invalid token
  // ---------------------------------------------------------------------------
  if (state === "invalid") {
    return (
      <AuthShell compact>
        <div className="space-y-6 text-center" data-testid="invite-invalid">
          <div className="flex justify-center animate-card-in">
            <div className="flex size-16 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--mist-dark)]">
              <Heart className="size-7" strokeWidth={1.75} aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-3 animate-card-in [animation-delay:40ms]">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
              Diese Einladung ist nicht mehr gültig
            </h1>
            <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
              Der Link ist abgelaufen oder wurde zurückgezogen. Bitte lass dir
              einen neuen Link schicken.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 w-full rounded-ordilo-md text-base press-scale animate-card-in [animation-delay:80ms]"
          >
            <Link href="/login">Zur Anmeldung</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Already in a family
  // ---------------------------------------------------------------------------
  if (state === "already_in_family") {
    return (
      <AuthShell compact>
        <div className="space-y-6 text-center" data-testid="invite-already-in-family">
          <div className="flex justify-center animate-card-in">
            <div className="flex size-16 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
              <UserPlus className="size-7" strokeWidth={1.75} aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-3 animate-card-in [animation-delay:40ms]">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
              Du bist schon in einer Familie
            </h1>
            <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
              Ein Konto kann im Moment nur zu einer Familie gehören. Melde dich
              mit einer anderen E-Mail-Adresse an, um dieser Familie
              beizutreten.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 w-full rounded-ordilo-md text-base press-scale animate-card-in [animation-delay:80ms]"
          >
            <Link href="/home">Zurück zu meiner Familie</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Valid — code sent, awaiting verification
  // ---------------------------------------------------------------------------
  if (sent) {
    const webmail = webmailFor(email);
    const codeDigits = Array.from({ length: 6 }, (_, index) => code[index] ?? "");

    return (
      <AuthShell compact>
        <div className="space-y-6 text-center">
          <div className="flex justify-center animate-card-in">
            <div className="relative flex size-16 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
              <Mail className="size-7" strokeWidth={1.75} aria-hidden="true" />
              <span className="absolute -right-1 top-0 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
            </div>
          </div>

          <div className="space-y-3 animate-card-in [animation-delay:40ms]">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
              Fast geschafft!
            </h1>
            <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
              Wir haben einen 6-stelligen Code an{" "}
              <span className="font-semibold text-foreground" data-testid="sent-email">
                {email}
              </span>{" "}
              geschickt. Gib ihn hier ein, dann bist du in der Familie.
            </p>
          </div>

          <form
            onSubmit={handleVerify}
            className="space-y-5 text-left animate-card-in [animation-delay:80ms]"
          >
            <fieldset>
              <legend className="mb-3 text-sm font-medium text-foreground">
                Dein 6-stelliger Code
              </legend>
              <div className="grid grid-cols-6 gap-2 sm:gap-3">
                {codeDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      codeInputRefs.current[index] = element;
                    }}
                    autoFocus={index === 0}
                    aria-label={`Ziffer ${index + 1} des Anmelde-Codes`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={6}
                    value={digit}
                    onChange={(event) => handleCodeChange(event.target.value, index)}
                    onKeyDown={(event) => handleCodeKeyDown(event, index)}
                    onFocus={() => setFocusedCodeIndex(index)}
                    disabled={verifying}
                    className={`h-14 min-w-0 rounded-ordilo-sm border bg-[var(--warm-white)] text-center text-xl font-medium tabular-nums text-foreground outline-none transition-[border-color,box-shadow,transform] duration-200 ${
                      focusedCodeIndex === index
                        ? "border-primary ring-[3px] ring-ring/20"
                        : "border-border"
                    } disabled:cursor-wait disabled:opacity-60`}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-[var(--petrol)]" aria-hidden="true" />
              Sicher und verschlüsselt
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-ordilo-sm bg-destructive/5 px-3 py-2 text-center text-sm font-medium text-destructive"
              >
                {errorMessage}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={verifying}
              className="h-12 w-full rounded-ordilo-md text-base press-scale"
            >
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird geprüft…
                </>
              ) : (
                <>
                  Familie beitreten
                  <ArrowRight className="size-5" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>

          {webmail && (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-ordilo-md text-base press-scale"
              data-testid="open-webmail-button"
            >
              <a href={webmail.url} target="_blank" rel="noopener noreferrer">
                {webmail.label}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          )}

          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Nichts angekommen? Schau auch im Spam-Ordner nach.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || resending || verifying}
                className="inline-flex items-center gap-1.5 rounded-ordilo-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] disabled:cursor-default disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="resend-button"
              >
                <RefreshCw
                  className={`size-4 ${resending ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {resending
                  ? "Wird gesendet …"
                  : resendCooldown > 0
                    ? `Nochmal senden (${resendCooldown}s)`
                    : "Nochmal senden"}
              </button>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                onClick={handleChangeEmail}
                className="inline-flex items-center gap-1.5 rounded-ordilo-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="change-email-button"
              >
                <Pencil className="size-4" aria-hidden="true" />
                Adresse ändern
              </button>
            </div>
          </div>
        </div>
      </AuthShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Valid — initial email entry
  // ---------------------------------------------------------------------------
  return (
    <AuthShell>
      <div className="space-y-5 sm:space-y-7 stagger-children" data-testid="invite-valid">
        <div className="hidden space-y-3 sm:block">
          <div className="flex items-center gap-2">
            <Heart className="size-5 text-[var(--petrol)]" aria-hidden="true" />
            <span className="text-sm font-medium text-[var(--petrol)]">Familieneinladung</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {familyName
                ? `Du bist eingeladen zu „${familyName}"`
                : "Du bist eingeladen"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Gib deine E-Mail-Adresse ein. Du bekommst einen Anmelde-Code.
            </p>
          </div>
        </div>

        <div className="sm:hidden">
          <div className="flex items-center gap-2">
            <Heart className="size-5 text-[var(--petrol)]" aria-hidden="true" />
            <span className="text-sm font-medium text-[var(--petrol)]">Familieneinladung</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
            {familyName
              ? `Eingeladen zu „${familyName}"`
              : "Du bist eingeladen"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Gib deine E-Mail-Adresse ein. Du bekommst einen Anmelde-Code.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">E-Mail-Adresse</Label>
            <Input
              autoFocus
              id="invite-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="du@beispiel.de"
              value={email}
              onChange={handleEmailChange}
              aria-invalid={validationError ? true : undefined}
              disabled={submitting}
              className="h-12 rounded-ordilo-sm bg-[var(--warm-white)]"
              data-testid="invite-email-input"
            />
            {validationError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {validationError}
              </p>
            )}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-ordilo-md border border-destructive/30 bg-destructive/5 px-4 py-3"
            >
              <p className="text-sm font-medium text-destructive">
                {errorMessage}
              </p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={submitting || !email.trim()}
            className="h-12 w-full rounded-ordilo-sm text-base press-scale"
            data-testid="invite-submit-button"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird verschickt…
              </>
            ) : (
              <>
                Familie beitreten
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="rounded-ordilo-sm bg-[var(--auth-sage)]/55 px-4 py-3.5">
          <div className="flex gap-3">
            <MailCheck
              className="mt-0.5 size-5 shrink-0 text-[var(--petrol)]"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-[var(--petrol-darker)]">
              <span className="font-semibold">Anmelden und Registrieren sind dasselbe.</span>{" "}
              Gibt es dein Konto noch nicht, legen wir es einfach an. Nach der
              Anmeldung bist du direkt Teil der Familie.
            </p>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
