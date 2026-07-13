import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 404 Not Found page — shown when no route matches.
 *
 * Warm, on-brand empty state with a link back to home.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="mb-5 flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <FileQuestion
          className="size-9"
          style={{ color: "var(--mist)" }}
          strokeWidth={1.5}
        />
      </div>

      <h3 className="text-base font-semibold text-foreground">
        Seite nicht gefunden
      </h3>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Diese Seite gibt es leider nicht.
      </p>

      <Link href="/home">
        <Button
          type="button"
          size="lg"
          className="mt-6 h-12 rounded-ordilo-md px-6"
        >
          Zur Startseite
        </Button>
      </Link>
    </div>
  );
}
