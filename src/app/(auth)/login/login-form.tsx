"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  Mail,
  ArrowRight,
  Loader2,
  Camera,
  Sparkles,
  BellRing,
  ExternalLink,
  Check,
  ShieldCheck,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateLoginEmail } from "@/lib/auth/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrdiloMascot } from "@/components/ordilo/mascot";

type FormState = "idle" | "submitting" | "sent" | "verifying" | "error";

/** Seconds before a login code can be re-sent. */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Webmail inbox URLs for common German email providers, so the
 * "check your inbox" moment is one tap instead of an app hunt.
 * Domains not listed simply don't get a button.
 */
const WEBMAIL_URLS: Record<string, { label: string; url: string }> = {
  "gmail.com": { label: "Gmail öffnen", url: "https://mail.google.com" },
  "googlemail.com": { label: "Gmail öffnen", url: "https://mail.google.com" },
  "gmx.de": { label: "GMX öffnen", url: "https://www.gmx.net" },
  "gmx.net": { label: "GMX öffnen", url: "https://www.gmx.net" },
  "web.de": { label: "WEB.DE öffnen", url: "https://web.de" },
  "t-online.de": {
    label: "T-Online öffnen",
    url: "https://email.t-online.de",
  },
  "outlook.com": {
    label: "Outlook öffnen",
    url: "https://outlook.live.com/mail",
  },
  "outlook.de": {
    label: "Outlook öffnen",
    url: "https://outlook.live.com/mail",
  },
  "hotmail.com": {
    label: "Outlook öffnen",
    url: "https://outlook.live.com/mail",
  },
  "icloud.com": { label: "iCloud Mail öffnen", url: "https://www.icloud.com/mail" },
};

function webmailFor(email: string): { label: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return WEBMAIL_URLS[domain] ?? null;
}

/**
 * Passwordless email-code login form.
 *
 * One field, one button, zero passwords. The idle state carries the
 * product promise (a new visitor must understand what Ordilo is without
 * leaving the page); the sent state carries the user across the inbox gap
 * without relying on a scanner-vulnerable email link.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [focusedCodeIndex, setFocusedCodeIndex] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  const sendLoginCode = useCallback(async (targetEmail: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
    });
    return !error;
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Client-side validation — never call signInWithOtp with invalid input.
    const result = validateLoginEmail(email);
    if (!result.success) {
      setValidationError(result.error);
      setFormState("idle");
      return;
    }

    setValidationError(null);
    setErrorMessage(null);
    setFormState("submitting");

    const ok = await sendLoginCode(result.data.email);
    if (!ok) {
      // Friendly German error — never surface the raw Supabase error JSON.
      setErrorMessage("Das hat nicht geklappt. Bitte versuch's nochmal.");
      setFormState("error");
      return;
    }

    setEmail(result.data.email);
    setFormState("sent");
    startCooldown();
  }

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    const ok = await sendLoginCode(email);
    setResending(false);
    if (!ok) {
      setErrorMessage("Der Code konnte nicht gesendet werden. Bitte versuch's nochmal.");
      return;
    }
    startCooldown();
  }, [email, resendCooldown, resending, sendLoginCode, startCooldown]);

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

    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setErrorMessage("Bitte gib den 6-stelligen Code ein.");
      return;
    }

    setErrorMessage(null);
    setFormState("verifying");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      setErrorMessage("Der Code ist nicht gültig oder abgelaufen. Bitte hol dir einen neuen.");
      setFormState("sent");
      return;
    }

    window.location.assign("/");
  }

  const handleChangeEmail = useCallback(() => {
    setFormState("idle");
    setCode("");
    setErrorMessage(null);
  }, []);

  function handleEmailChange(event: React.ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    // Clear validation error as the user edits, so the field doesn't stay
    // flagged after they start correcting.
    if (validationError) setValidationError(null);
    if (formState === "error") {
      setFormState("idle");
      setErrorMessage(null);
    }
  }

  // Confirmation state — a login code was sent successfully.
  if (formState === "sent" || formState === "verifying") {
    const webmail = webmailFor(email);
    const codeDigits = Array.from({ length: 6 }, (_, index) => code[index] ?? "");

    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-8">
        <div className="w-full max-w-sm space-y-7 text-center">
          <div className="flex justify-center animate-card-in">
            <div className="relative flex size-20 items-center justify-center rounded-full border border-border bg-card text-[var(--petrol)] shadow-card">
              <Mail className="size-9" strokeWidth={1.75} aria-hidden="true" />
              <span className="absolute -right-1 top-0 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
            </div>
          </div>

          <div className="space-y-3 animate-card-in [animation-delay:40ms]">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Fast geschafft!
            </h1>
            <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
              Wir haben einen 6-stelligen Code an{" "}
              <span className="font-semibold text-foreground" data-testid="sent-email">
                {email}
              </span>{" "}
              geschickt. Gib ihn hier ein, dann bist du drin.
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
                    disabled={formState === "verifying"}
                    className={`h-14 min-w-0 rounded-ordilo-sm border bg-card text-center text-xl font-medium tabular-nums text-foreground outline-none transition-[border-color,box-shadow,transform] duration-200 ${
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
              disabled={formState === "verifying"}
              className="h-12 w-full rounded-ordilo-md text-base press-scale"
            >
              {formState === "verifying" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird geprüft…
                </>
              ) : (
                <>
                  Anmelden
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
                disabled={resendCooldown > 0 || resending || formState === "verifying"}
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
      </main>
    );
  }

  // Login form — idle, submitting, or error state.
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-8 stagger-children">
        <div className="space-y-5 text-center">
          <div className="flex justify-center">
            <OrdiloMascot
              size={64}
              mood="greeting"
              style={{ color: "var(--petrol)" }}
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Frag einfach Ordilo
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Der Ordner, der mitdenkt: Dokumente scannen, alles
              wiederfinden, keine Frist mehr verpassen.
            </p>
          </div>

          {/* The product in three verbs — quiet, scannable, no marketing-speak */}
          <div
            className="flex items-center justify-center gap-4 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            <span className="inline-flex items-center gap-1.5">
              <Camera className="size-3.5 text-[var(--petrol)]" />
              Scannen
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-[var(--petrol)]" />
              Fragen
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <BellRing className="size-3.5 text-[var(--petrol)]" />
              Erinnert werden
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail-Adresse</Label>
            <Input
              autoFocus
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="du@beispiel.de"
              value={email}
              onChange={handleEmailChange}
              aria-invalid={validationError ? true : undefined}
              disabled={formState === "submitting"}
              className="h-12 rounded-ordilo-md"
            />
            {validationError && (
              <p
                role="alert"
                className="text-sm font-medium text-destructive"
              >
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
            disabled={formState === "submitting"}
            className="h-12 w-full rounded-ordilo-md text-base"
          >
            {formState === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird verschickt…
              </>
            ) : (
              <>
                Loslegen — ohne Passwort
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Anmelden und Registrieren sind dasselbe: Gibt es dein Konto noch
          nicht, legen wir es einfach an. Mit der Anmeldung stimmst du den
          Nutzungsbedingungen zu.
        </p>

        <nav
          className="flex items-center justify-center gap-4 text-xs text-muted-foreground"
          aria-label="Rechtliches"
        >
          <Link
            href="/impressum"
            className="rounded-ordilo-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Impressum
          </Link>
          <Link
            href="/datenschutz"
            className="rounded-ordilo-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Datenschutz
          </Link>
        </nav>
      </div>
    </main>
  );
}
