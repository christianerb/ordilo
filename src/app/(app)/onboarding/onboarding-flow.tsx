"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  UserPlus,
  Camera,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonCard } from "@/components/ordilo/person-card";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { createFamily, addMember, completeOnboarding } from "./actions";
import { cn } from "@/lib/utils";

/**
 * The onboarding step the user is currently on.
 * - "family-name": one combined card — family name + the user's own first
 *   name (family + self-member are created with a single submit)
 * - "add-member": quick-add loop for further members (role via one-tap
 *   chips), with the finish action on the same card — no interstitial
 * - "choose-next": legacy resume alias from the server (family + members
 *   exist, onboarding not completed) — rendered as "add-member"
 * - "ready": the springboard — onboarding is done, the primary action
 *   jumps straight into scanning the first document (the aha moment)
 */
export type OnboardingStep = "family-name" | "add-member" | "choose-next" | "ready";

/**
 * A family member as returned from the database (or created during the flow).
 */
export interface OnboardingMember {
  id: string;
  name: string;
  role: string | null;
  birthdate: string | null;
  avatar_color: string | null;
}

/**
 * The initial state passed from the server component. This determines
 * where the flow resumes (e.g. after a reload mid-onboarding).
 */
export interface OnboardingState {
  step: OnboardingStep;
  familyId: string | null;
  familyName: string | null;
  members: OnboardingMember[];
}

/**
 * Friendly German error surfaced when a server action *throws* (network
 * failure, server action invocation error) rather than returning a
 * `{ success: false }` result. Kept consistent with the FRIENDLY_ERROR in
 * actions.ts so handled and unhandled failures look identical to the user.
 */
const NETWORK_ERROR = "Das hat nicht geklappt. Bitte versuch's nochmal.";

/** One-tap role suggestions for the quick-add step. */
const ROLE_CHIPS = ["Partner:in", "Kind", "Oma", "Opa"] as const;

/**
 * Onboarding flow — two steps, then straight into the product.
 *
 * Design goal: an impatient person finishes this in under 30 seconds and
 * lands in the scanner with a letter in hand. Concretely:
 *
 * 1. "Wer seid ihr?" — family name + own first name, ONE submit
 *    (creates the family and the self-linked member together).
 * 2. "Wer gehört dazu?" — optional quick-add loop: name + one-tap role
 *    chips; every add stays on the same card. Finishing is always one
 *    tap away and never gated on adding anyone.
 * 3. Ready springboard: "Scanne dein erstes Dokument" completes
 *    onboarding and opens the scanner directly (/home?scan=1) — the
 *    shortest possible path to the first aha.
 */
export function OnboardingFlow({ initialState }: { initialState: OnboardingState }) {
  const router = useRouter();

  // Normalize the legacy resume step: "choose-next" renders as the
  // quick-add card (which now carries the finish action itself).
  const [step, setStep] = useState<OnboardingStep>(
    initialState.step === "choose-next" ? "add-member" : initialState.step,
  );
  const [familyId, setFamilyId] = useState<string | null>(initialState.familyId);
  const [familyName, setFamilyName] = useState<string | null>(initialState.familyName);
  const [members, setMembers] = useState<OnboardingMember[]>(initialState.members);

  // Step 1 form state
  const [familyNameInput, setFamilyNameInput] = useState("");
  const [selfNameInput, setSelfNameInput] = useState("");

  // Step 2 form state
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");

  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Step 1: family + self in one submit
  // ---------------------------------------------------------------------------

  const handleFamilySubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setValidationError(null);
      setServerError(null);

      if (!familyNameInput.trim()) {
        setValidationError("Bitte gib einen Familiennamen ein");
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await createFamily(familyNameInput);
        if (!result.success) {
          setServerError(result.error);
          return;
        }

        setFamilyId(result.data.id);
        setFamilyName(result.data.name);

        // Create the self-member in the same step (optional field). A
        // failure here must not strand the flow — the member can be added
        // on the next card or later on /familie.
        if (selfNameInput.trim()) {
          const selfResult = await addMember(result.data.id, {
            name: selfNameInput,
            is_self: true,
          });
          if (selfResult.success) {
            setMembers((prev) => [
              ...prev,
              {
                id: selfResult.data.id,
                name: selfResult.data.name,
                role: selfResult.data.role,
                birthdate: selfResult.data.birthdate,
                avatar_color: selfResult.data.avatar_color,
              },
            ]);
          }
        }

        setFamilyNameInput("");
        setStep("add-member");
      } catch {
        // Network/server-action invocation failure — surface a friendly,
        // recoverable German error. The input is preserved so the user can
        // retry in place without reloading the page.
        setServerError(NETWORK_ERROR);
      } finally {
        setIsSubmitting(false);
      }
    },
    [familyNameInput, selfNameInput],
  );

  // ---------------------------------------------------------------------------
  // Step 2: quick-add loop (stays on the card) + finish
  // ---------------------------------------------------------------------------

  const handleMemberSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setValidationError(null);
      setServerError(null);

      if (!memberName.trim()) {
        setValidationError("Bitte einen Namen eingeben");
        return;
      }

      if (!familyId) {
        setServerError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await addMember(familyId, {
          name: memberName,
          role: memberRole || undefined,
        });
        if (!result.success) {
          setServerError(result.error);
          return;
        }

        setMembers((prev) => [
          ...prev,
          {
            id: result.data.id,
            name: result.data.name,
            role: result.data.role,
            birthdate: result.data.birthdate,
            avatar_color: result.data.avatar_color,
          },
        ]);

        // Stay on the card, ready for the next person — no interstitial.
        setMemberName("");
        setMemberRole("");
      } catch {
        // Network/server-action invocation failure — surface a friendly,
        // recoverable German error. The entered name is preserved so the
        // user can retry in place without reloading.
        setServerError(NETWORK_ERROR);
      } finally {
        setIsSubmitting(false);
      }
    },
    [familyId, memberName, memberRole],
  );

  const handleProceedToReady = useCallback(() => {
    setServerError(null);
    setStep("ready");
  }, []);

  // ---------------------------------------------------------------------------
  // Step 3: complete + springboard into the scanner
  // ---------------------------------------------------------------------------

  const finishOnboarding = useCallback(
    async (destination: string) => {
      setServerError(null);

      if (!familyId) {
        setServerError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await completeOnboarding(familyId);
        if (!result.success) {
          setServerError(result.error);
          return;
        }
        router.push(destination);
      } catch {
        setServerError(NETWORK_ERROR);
      } finally {
        setIsSubmitting(false);
      }
    },
    [router, familyId],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="flex min-h-[calc(100dvh-60px)] flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="mx-auto max-w-md space-y-4 pt-4">
          {/* Step 1: family + self */}
          {step === "family-name" && (
            <>
              <MascotBubble>
                Hallo! Ich bin Ordilo und kümmere mich um eure
                Familienunterlagen — nichts geht verloren, keine Frist geht
                unter. Zwei kurze Fragen, dann geht&apos;s los.
              </MascotBubble>

              <div className="rounded-ordilo-md border border-border bg-card p-4 shadow-card">
                <form onSubmit={handleFamilySubmit} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="family-name">Wie heißt eure Familie?</Label>
                    <Input
                      autoFocus
                      id="family-name"
                      type="text"
                      autoComplete="off"
                      placeholder="z. B. Familie Müller"
                      value={familyNameInput}
                      onChange={(e) => {
                        setFamilyNameInput(e.target.value);
                        if (validationError) setValidationError(null);
                        if (serverError) setServerError(null);
                      }}
                      aria-invalid={validationError ? true : undefined}
                      disabled={isSubmitting}
                      className="h-12 rounded-ordilo-md text-base"
                    />
                    {validationError && (
                      <p role="alert" className="text-sm font-medium text-destructive">
                        {validationError}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="self-name">
                      Und du? <span className="font-normal text-muted-foreground">(dein Vorname, optional)</span>
                    </Label>
                    <Input
                      id="self-name"
                      type="text"
                      autoComplete="given-name"
                      placeholder="z. B. Anna"
                      value={selfNameInput}
                      onChange={(e) => setSelfNameInput(e.target.value)}
                      disabled={isSubmitting}
                      className="h-12 rounded-ordilo-md text-base"
                    />
                  </div>

                  {serverError && <ErrorBanner message={serverError} />}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-ordilo-md text-base"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird gespeichert…
                      </>
                    ) : (
                      <>
                        Weiter
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}

          {/* Step 2: quick-add members (finish always one tap away) */}
          {step === "add-member" && (
            <>
              <MascotBubble>
                {familyName ? `Schön, ${familyName}!` : "Schön!"} Wer gehört
                noch dazu? Du kannst das auch jederzeit später ergänzen.
              </MascotBubble>

              <div className="space-y-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card">
                {members.length > 0 && (
                  <div className="space-y-2" data-testid="onboarding-member-list">
                    {members.map((m) => (
                      <PersonCard
                        key={m.id}
                        name={m.name}
                        role={m.role}
                        avatarColor={m.avatar_color}
                      />
                    ))}
                  </div>
                )}

                <form onSubmit={handleMemberSubmit} className="space-y-3" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="member-name">Name</Label>
                    <Input
                      autoFocus
                      id="member-name"
                      type="text"
                      autoComplete="off"
                      placeholder="z. B. Emma"
                      value={memberName}
                      onChange={(e) => {
                        setMemberName(e.target.value);
                        if (validationError) setValidationError(null);
                        if (serverError) setServerError(null);
                      }}
                      aria-invalid={validationError ? true : undefined}
                      disabled={isSubmitting}
                      className="h-12 rounded-ordilo-md text-base"
                    />
                    {validationError && (
                      <p role="alert" className="text-sm font-medium text-destructive">
                        {validationError}
                      </p>
                    )}
                  </div>

                  {/* One-tap role chips — no dropdown, no extra screen */}
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Rolle wählen">
                    {ROLE_CHIPS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setMemberRole(memberRole === role ? "" : role)}
                        disabled={isSubmitting}
                        aria-pressed={memberRole === role}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          memberRole === role
                            ? "bg-[var(--petrol)] text-white"
                            : "bg-secondary text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>

                  {serverError && <ErrorBanner message={serverError} />}

                  <Button
                    type="submit"
                    variant="outline"
                    size="lg"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-ordilo-md text-base"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird gespeichert…
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Person hinzufügen
                      </>
                    )}
                  </Button>
                </form>

                <Button
                  type="button"
                  size="lg"
                  onClick={handleProceedToReady}
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-ordilo-md text-base"
                  data-testid="onboarding-finish-button"
                >
                  <Check className="h-4 w-4" />
                  {members.length > 0 ? "Fertig — los geht's" : "Später — erstmal loslegen"}
                </Button>
              </div>
            </>
          )}

          {/* Step 3: ready springboard — straight into the first scan */}
          {step === "ready" && (
            <>
              <div className="flex flex-col items-center pt-8 text-center">
                <OrdiloMascot
                  size={72}
                  mood="success"
                  animate
                  style={{ color: "var(--petrol)" }}
                />
                <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                  {familyName ? `${familyName} ist startklar!` : "Alles startklar!"}
                </h1>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Hol dir einen Brief vom Stapel — ich lese ihn, merke mir
                  alles Wichtige, und du kannst mich einfach danach fragen.
                </p>
              </div>

              {serverError && <ErrorBanner message={serverError} />}

              <div className="space-y-2 pt-2">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => finishOnboarding("/home?scan=1")}
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-ordilo-md text-base"
                  data-testid="onboarding-scan-button"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Einen Moment…
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Erstes Dokument scannen
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => finishOnboarding("/home")}
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-ordilo-md text-base text-muted-foreground"
                  data-testid="onboarding-skip-scan-button"
                >
                  Erstmal umschauen
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

/**
 * Mascot bubble — Ordilo speaking, one bubble per step.
 */
function MascotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <OrdiloMascot size={22} mood="idle" />
      </div>
      <div className="flex-1 pt-1">
        <p className="text-sm leading-relaxed text-foreground">{children}</p>
      </div>
    </div>
  );
}

/**
 * Error banner — friendly German error with retry implied by re-rendering.
 */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-ordilo-md border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <p className="text-sm font-medium text-destructive">{message}</p>
    </div>
  );
}
