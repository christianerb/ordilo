"use client";

import { useState } from "react";
import { Sparkles, Mail, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateLoginEmail } from "@/lib/auth/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormState = "idle" | "submitting" | "sent" | "error";

/**
 * Magic link login form.
 *
 * Client component: handles email validation (German messages), calls
 * `supabase.auth.signInWithOtp`, and shows a German confirmation state on
 * success. The magic link redirects to `/auth/callback` which exchanges
 * the code for a session.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: result.data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      // Friendly German error — never surface the raw Supabase error JSON.
      setErrorMessage(
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      );
      setFormState("error");
      return;
    }

    setFormState("sent");
  }

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
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-ordilo-lg bg-primary text-primary-foreground shadow-card">
              <Mail className="h-8 w-8" />
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Magischer Link verschickt
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Wir haben dir einen Magischen Link geschickt. Bitte überprüfe
              dein Postfach.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Klicke auf den Link in der E-Mail, um dich anzumelden.
          </p>
        </div>
      </main>
    );
  }

  // Login form — idle, submitting, or error state.
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-ordilo-lg bg-primary text-primary-foreground shadow-card">
              <Sparkles className="h-8 w-8" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Anmelden
            </h1>
            <p className="text-sm text-muted-foreground">
              Gib deine E-Mail-Adresse ein. Wir senden dir einen Magischen
              Link zur Anmeldung.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail-Adresse</Label>
            <Input
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
                Wird gesendet…
              </>
            ) : (
              <>
                Magischen Link senden
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Mit der Anmeldung stimmst du den Nutzungsbedingungen zu.
        </p>
      </div>
    </main>
  );
}
