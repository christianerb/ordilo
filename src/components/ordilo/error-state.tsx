"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ErrorState — the calm "something went wrong" surface.
 *
 * Parallels {@link EmptyState}: an icon, a title, a description, and a
 * retry action. Three variants cover the current call sites:
 * - "simple" — no card, muted icon, ghost button (familie list)
 * - "card" — bordered card, destructive icon, large button (dokumente)
 * - "prominent" — destructive circle icon, large button (settings)
 */
export function ErrorState({
  title,
  description,
  retryLabel = "Erneut versuchen",
  onRetry,
  testId,
  variant = "card",
  className,
}: {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry: () => void;
  testId?: string;
  variant?: "simple" | "card" | "prominent";
  className?: string;
}) {
  if (variant === "prominent") {
    return (
      <div
        data-testid={testId}
        className={cn(
          "flex flex-col items-center justify-center px-6 py-12 text-center",
          className,
        )}
      >
        <div
          className="mb-5 flex size-20 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--destructive)" }}
          aria-hidden="true"
        >
          <AlertCircle className="size-9 text-white" strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          onClick={onRetry}
          className="mt-6 h-12 rounded-ordilo-md px-6"
        >
          <RefreshCw className="h-5 w-5" />
          {retryLabel}
        </Button>
      </div>
    );
  }

  if (variant === "simple") {
    return (
      <div
        data-testid={testId}
        className={cn(
          "flex flex-col items-center justify-center px-6 py-16 text-center",
          className,
        )}
      >
        <AlertCircle className="size-7 text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-3 text-sm text-muted-foreground">{title}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="mt-4"
        >
          <RefreshCw className="size-4" />
          {retryLabel}
        </Button>
      </div>
    );
  }

  // variant === "card"
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center gap-3 rounded-ordilo-md border border-border bg-card p-8 text-center shadow-card",
        className,
      )}
    >
      <AlertCircle className="size-7 text-destructive" aria-hidden="true" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      )}
      <Button
        type="button"
        size="lg"
        onClick={onRetry}
        className="mt-1 h-11 rounded-ordilo-md"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  );
}
