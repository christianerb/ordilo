"use client";

import { useCallback, useRef, useState } from "react";
import {
  Mail,
  ArrowRight,
  Loader2,
  Camera,
  Sparkles,
  BellRing,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateLoginEmail } from "@/lib/auth/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrdiloMascot } from "@/components/ordilo/mascot";

type FormState = "idle" | "submitting" | "sent" | "error";

/** Seconds before the magic link can be re-sent. */
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
 * Magic link login form.
 *
 * One field, one button, zero passwords. The idle state carries the
 * product promise (a new visitor must understand what Ordilo is without
 * leaving the page); the sent state carries the user across the inbox
 * gap: it shows the exact address, deep-links to known webmail providers,
 * offers a re-send after a cooldown, and a way back to fix a typo.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const sendMagicLink = useCallback(async (targetEmail: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
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

    const ok = await sendMagicLink(result.data.email);
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
    await sendMagicLink(email);
    setResending(false);
    startCooldown();
  }, [email, resendCooldown, resending, sendMagicLink, startCooldown]);

  const handleChangeEmail = useCallback(() => {
    setFormState("idle");
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

  // Confirmation state — magic link sent successfully.
  if (formState === "sent") {
    const webmail = webmailFor(email);
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-6 text-center stagger-children">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-ordilo-md bg-primary text-primary-foreground shadow-card">
              <Mail className="h-8 w-8" aria-hidden="true" />
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Die E-Mail ist unterwegs
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Wir haben einen Anmelde-Link an{" "}
              <span className="font-medium text-foreground" data-testid="sent-email">
                {email}
              </span>{" "}
              geschickt. Ein Klick darauf — und du bist drin.
            </p>
          </div>

          {webmail && (
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-ordilo-md text-base"
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
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || resending}
                className="font-medium text-[var(--petrol)] underline-offset-2 hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
                data-testid="resend-button"
              >
                {resending
                  ? "Wird gesendet …"
                  : resendCooldown > 0
                    ? `Nochmal senden (${resendCooldown}s)`
                    : "Nochmal senden"}
              </button>
              <button
                type="button"
                onClick={handleChangeEmail}
                className="font-medium text-[var(--petrol)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
                data-testid="change-email-button"
              >
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
      </div>
    </main>
  );
}
