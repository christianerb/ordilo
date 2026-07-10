import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CleanUrl } from "./clean-url";

/**
 * Auth error page.
 *
 * Shown when a magic link callback fails (expired, already-used, or
 * malformed). Displays a German error message and a link back to /login.
 * No unauthenticated app content is revealed.
 */
export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <CleanUrl />
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-ordilo-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Anmeldelink ungültig
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dieser Anmeldelink ist abgelaufen oder wurde bereits verwendet.
            Bitte fordere einen neuen an.
          </p>
        </div>
        <Button asChild size="lg" className="h-12 w-full rounded-ordilo-md text-base">
          <Link href="/login">
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Anmeldung
          </Link>
        </Button>
      </div>
    </main>
  );
}
