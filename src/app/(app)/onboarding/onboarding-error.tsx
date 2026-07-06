"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error state for the onboarding page.
 *
 * Shown when the server-side family/member bootstrap queries fail (e.g.
 * transient Supabase outage). This prevents the user from being silently
 * misrouted into the onboarding flow when they already have a family, or
 * from creating a duplicate family because the lookup failed.
 *
 * The user can retry by clicking the "Erneut versuchen" button, which
 * calls `router.refresh()` to re-run the server component.
 */
export function OnboardingError() {
  const router = useRouter();

  return (
    <main
      data-testid="onboarding-error"
      className="flex min-h-[calc(100dvh-60px)] flex-col items-center justify-center bg-background px-6 py-12 text-center"
    >
      <div
        className="mb-5 flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--destructive)" }}
        aria-hidden="true"
      >
        <AlertCircle
          className="size-9 text-white"
          strokeWidth={1.5}
        />
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        Daten konnten nicht geladen werden
      </h3>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Es ist ein Fehler aufgetreten. Bitte versuche es erneut.
      </p>
      <Button
        type="button"
        size="lg"
        onClick={() => router.refresh()}
        className="mt-6 h-12 rounded-ordilo-md px-6"
      >
        <RefreshCw className="h-5 w-5" />
        Erneut versuchen
      </Button>
    </main>
  );
}
