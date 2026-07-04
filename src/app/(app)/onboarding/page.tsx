import { Sparkles } from "lucide-react";

/**
 * Onboarding entry point (placeholder).
 *
 * The full conversational onboarding flow is built by a subsequent
 * feature. This minimal page shows the welcoming prompt so that first-time
 * users land on the right destination after the magic link callback.
 */
export default function OnboardingPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center space-y-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-ordilo-lg bg-primary text-primary-foreground shadow-card">
        <Sparkles className="h-8 w-8" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Willkommen
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Ich helfe dir, euren Familienordner automatisch zu organisieren.
          Wen soll ich anlegen?
        </p>
      </div>
    </div>
  );
}
