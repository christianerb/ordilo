"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * App-level Error Boundary — catches errors within (app) routes.
 *
 * Unlike global-error.tsx, this renders inside the root layout so it has
 * access to globals.css and the design system. Shown when a Server
 * Component or Server Action in an authenticated route throws.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="mb-5 flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <AlertCircle
          className="size-9"
          style={{ color: "var(--mist)" }}
          strokeWidth={1.5}
        />
      </div>

      <h3 className="text-base font-semibold text-foreground">
        Etwas ist schiefgelaufen
      </h3>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Die Seite konnte nicht geladen werden. Versuche es erneut.
      </p>

      <Button
        type="button"
        size="lg"
        onClick={reset}
        className="mt-6 h-12 rounded-ordilo-md px-6"
      >
        Erneut versuchen
      </Button>
    </div>
  );
}
