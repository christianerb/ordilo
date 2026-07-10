"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, ChevronDown, ChevronUp, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonCard } from "@/components/ordilo/person-card";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { createFamily, addMember, completeOnboarding } from "./actions";
import { AVATAR_COLORS } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";

/**
 * The onboarding step the user is currently on.
 * - "family-name": welcoming + asking for the family name
 * - "add-member": asking for a family member's details
 * - "choose-next": showing the running list and asking to add another or finish
 */
export type OnboardingStep = "family-name" | "add-member" | "choose-next";

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
 * A message in the conversation log (AI prompt or user response).
 */
interface ConversationMessage {
  id: string;
  type: "ai" | "user";
  content: string;
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

/**
 * Friendly German error surfaced when a server action *throws* (network
 * failure, server action invocation error) rather than returning a
 * `{ success: false }` result. Kept consistent with the FRIENDLY_ERROR in
 * actions.ts so handled and unhandled failures look identical to the user.
 */
const NETWORK_ERROR = "Das hat nicht geklappt. Bitte versuch's nochmal.";

/**
 * Conversational onboarding flow.
 *
 * Guides the user through family creation and member creation in a
 * conversational sequence. Each step reveals the next prompt after the
 * previous input is submitted. The flow is:
 *
 * 1. Welcome + ask for family name (required)
 * 2. Ask for member name (required) + optional fields (role, birthdate, color)
 * 3. Show running list of added members as person cards
 * 4. Ask "Möchtest du noch jemanden anlegen?" → add another or finish
 *
 * On finish, the user is redirected to /home.
 */
export function OnboardingFlow({ initialState }: { initialState: OnboardingState }) {
  const router = useRouter();

  const [step, setStep] = useState<OnboardingStep>(initialState.step);
  const [familyId, setFamilyId] = useState<string | null>(initialState.familyId);
  const [members, setMembers] = useState<OnboardingMember[]>(initialState.members);
  const [conversation, setConversation] = useState<ConversationMessage[]>(() =>
    buildInitialConversation(initialState),
  );

  // Form + error state
  const [familyNameInput, setFamilyNameInput] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberBirthdate, setMemberBirthdate] = useState("");
  const [memberAvatarColor, setMemberAvatarColor] = useState<string>("");
  const [memberIsSelf, setMemberIsSelf] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for scroll management
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when content changes (Rule 4: DOM integration
  // via ResizeObserver, replaces useEffect on [conversation, step, members.length])
  useMountEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    observer.observe(container);
    return () => observer.disconnect();
  });

  // ---------------------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------------------

  const handleFamilyNameSubmit = useCallback(
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

        // Success — update state and advance to member creation.
        setFamilyId(result.data.id);
        setConversation((prev) => [
          ...prev,
          { id: nextMessageId(), type: "user", content: result.data.name },
          {
            id: nextMessageId(),
            type: "ai",
            content: `Schön, ${result.data.name}! Wen möchtest du als Erstes anlegen?`,
          },
        ]);
        setFamilyNameInput("");
        setStep("add-member");
      } catch {
        // Network/server-action invocation failure — surface a friendly,
        // recoverable German error. The input is preserved so the user can
        // retry in place without reloading the page.
        setServerError(NETWORK_ERROR);
      } finally {
        // Always clear the saving flag so the button is never stuck on
        // "Wird gespeichert…" — even when the action throws.
        setIsSubmitting(false);
      }
    },
    [familyNameInput],
  );

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
          birthdate: memberBirthdate || undefined,
          avatar_color: memberAvatarColor || undefined,
          is_self: memberIsSelf,
        });
        if (!result.success) {
          setServerError(result.error);
          return;
        }

        // Success — add to running list and advance.
        const newMember: OnboardingMember = {
          id: result.data.id,
          name: result.data.name,
          role: result.data.role,
          birthdate: result.data.birthdate,
          avatar_color: result.data.avatar_color,
        };
        setMembers((prev) => [...prev, newMember]);
        setConversation((prev) => [
          ...prev,
          { id: nextMessageId(), type: "user", content: memberName.trim() },
          {
            id: nextMessageId(),
            type: "ai",
            content: `${memberName.trim()} ist dabei — schön.`,
          },
        ]);

        // Reset member form
        setMemberName("");
        setMemberRole("");
        setMemberBirthdate("");
        setMemberAvatarColor("");
        setMemberIsSelf(false);
        setShowOptional(false);
        setStep("choose-next");
      } catch {
        // Network/server-action invocation failure — surface a friendly,
        // recoverable German error. The entered name (and optional fields)
        // are preserved so the user can retry in place without reloading.
        setServerError(NETWORK_ERROR);
      } finally {
        // Always clear the saving flag so the button is never stuck on
        // "Wird gespeichert…" — even when the action throws.
        setIsSubmitting(false);
      }
    },
    [familyId, memberName, memberRole, memberBirthdate, memberAvatarColor, memberIsSelf],
  );

  const handleAddAnother = useCallback(() => {
    setServerError(null);
    setConversation((prev) => [
      ...prev,
      {
        id: nextMessageId(),
        type: "ai",
        content: "Wen möchtest du noch hinzufügen?",
      },
    ]);
    setStep("add-member");
  }, []);

  const handleFinish = useCallback(async () => {
    setServerError(null);

    if (!familyId) {
      setServerError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
      return;
    }

    // Mark onboarding as completed before leaving. This sets the durable
    // onboarding_completed_at marker so the middleware allows the user to
    // access app routes (including /familie) even if they later remove
    // all members.
    setIsSubmitting(true);
    try {
      const result = await completeOnboarding(familyId);
      if (!result.success) {
        setServerError(result.error);
        return;
      }

      router.push("/home");
    } catch {
      // Network/server-action invocation failure — surface a friendly,
      // recoverable German error so the user can retry the finish action
      // in place without reloading the page.
      setServerError(NETWORK_ERROR);
    } finally {
      // Always clear the saving flag so the "Fertig" button is never
      // stuck on "Wird abgeschlossen…".
      setIsSubmitting(false);
    }
  }, [router, familyId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="flex min-h-[calc(100dvh-60px)] flex-col bg-background">
      {/* Conversation scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-4"
      >
        <div className="mx-auto max-w-md space-y-4 pt-2">
          {/* Render conversation messages */}
          {conversation.map((msg) => (
            <ConversationBubble key={msg.id} message={msg} />
          ))}

          {/* Running list of members (shown when there are members) */}
          {members.length > 0 && step !== "add-member" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {members.length === 1
                  ? "Bisher hinzugefügt:"
                  : `Bisher hinzugefügt (${members.length}):`}
              </p>
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

          {/* Current step: family name input */}
          {step === "family-name" && (
            <div className="space-y-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card">
              <form onSubmit={handleFamilyNameSubmit} className="space-y-3" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="family-name">Familienname</Label>
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
                    "Weiter"
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Current step: add member */}
          {step === "add-member" && (
            <div className="space-y-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card">
              {/* Running list above the form (if there are already members) */}
              {members.length > 0 && (
                <div className="space-y-2">
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

                {/* "Das bin ich" toggle — links this member to the account owner */}
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={memberIsSelf}
                    onChange={(e) => setMemberIsSelf(e.target.checked)}
                    disabled={isSubmitting}
                    className="size-4 rounded border-border accent-[var(--petrol)]"
                  />
                  Das bin ich
                </label>

                {/* Optional fields toggle */}
                <button
                  type="button"
                  onClick={() => setShowOptional((s) => !s)}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showOptional ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Weitere Angaben (optional)
                </button>

                {showOptional && (
                  <div className="space-y-3 rounded-ordilo-md bg-secondary/50 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="member-role">Rolle</Label>
                      <Input
                        id="member-role"
                        type="text"
                        autoComplete="off"
                        placeholder="z. B. Vater, Mutter, Kind"
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value)}
                        disabled={isSubmitting}
                        className="h-11 rounded-ordilo-md"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="member-birthdate">Geburtsdatum</Label>
                      <Input
                        id="member-birthdate"
                        type="date"
                        value={memberBirthdate}
                        onChange={(e) => setMemberBirthdate(e.target.value)}
                        disabled={isSubmitting}
                        className="h-11 rounded-ordilo-md"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Farbe</Label>
                      <div className="flex flex-wrap gap-2">
                        {AVATAR_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() =>
                              setMemberAvatarColor(
                                memberAvatarColor === color ? "" : color,
                              )
                            }
                            className={cn(
                              "size-9 rounded-full transition-all",
                              memberAvatarColor === color
                                ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                                : "ring-1 ring-border",
                            )}
                            style={{ backgroundColor: color }}
                            aria-label={`Farbe ${color} auswählen`}
                            aria-pressed={memberAvatarColor === color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

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
                      <UserPlus className="h-4 w-4" />
                      Person hinzufügen
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Current step: choose next (add another or finish) */}
          {step === "choose-next" && (
            <div className="space-y-3">
              <div className="rounded-ordilo-md border border-border bg-card p-4 shadow-card">
                <p className="mb-4 font-medium text-foreground">
                  Noch jemand, der dazugehört?
                </p>
                <div className="space-y-2">
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={handleAddAnother}
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-ordilo-md text-base"
                  >
                    <Plus className="h-4 w-4" />
                    Weitere Person hinzufügen
                  </Button>
                  {serverError && <ErrorBanner message={serverError} />}
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleFinish}
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-ordilo-md text-base"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird abgeschlossen…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Fertig
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
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
 * A conversation bubble — AI prompt or user response.
 */
function ConversationBubble({ message }: { message: ConversationMessage }) {
  if (message.type === "ai") {
    return (
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <OrdiloMascot size={22} mood="idle" />
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm leading-relaxed text-foreground">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // User response — shown as a subtle confirmation of what they entered.
  return (
    <div className="pl-12">
      <div className="inline-block rounded-ordilo-md bg-secondary px-3 py-1.5 text-sm font-medium text-foreground">
        {message.content}
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

// ---------------------------------------------------------------------------
// Initial conversation builder
// ---------------------------------------------------------------------------

/**
 * Build the initial conversation messages based on the onboarding state.
 *
 * - Fresh start: welcome message only (family name prompt follows)
 * - Resume (family exists, no members): welcome + family name exchange + member prompt
 */
function buildInitialConversation(state: OnboardingState): ConversationMessage[] {
  const messages: ConversationMessage[] = [
    {
      id: nextMessageId(),
      type: "ai",
      content:
        "Hallo! Schön, dass du da bist. Ich bin Ordilo und sorge mich um eure Familienunterlagen — damit nichts verloren geht und Fristen nicht untergehen. Wie heißt eure Familie?",
    },
    {
      id: nextMessageId(),
      type: "ai",
      content: "Wie heißt eure Familie?",
    },
  ];

  if (state.familyName && state.step === "add-member") {
    // Resuming after family was already created — show the exchange.
    messages.push(
      { id: nextMessageId(), type: "user", content: state.familyName },
      {
        id: nextMessageId(),
        type: "ai",
      content: `Schön, ${state.familyName}! Wen möchtest du als Erstes anlegen?`,
      },
    );
  }

  return messages;
}
