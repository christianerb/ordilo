"use client";

import { useCallback, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSecretReveal } from "@/lib/hooks/use-secret-reveal";

/**
 * The row primitives of a login: an address that opens, a value that
 * copies, a password that reveals.
 *
 * Shared by the chat answer card and the document detail sheet so a login
 * behaves the same wherever it is shown — the point of both is that nobody
 * has to retype a password by hand.
 */

// ---------------------------------------------------------------------------
// Link safety
// ---------------------------------------------------------------------------

/** Field labels that mark a value as the address of the login page. */
const URL_LABEL = /^(url|adresse|website|webseite|seite|link|portal)$/i;

/**
 * Turn a value into an external link target, or null if it is not a safe
 * one.
 *
 * The value comes from document text the OCR pipeline read, and in the
 * chat it passes through the model — untrusted either way. Anything but
 * http(s) is refused (a `javascript:` value would otherwise become a
 * clickable script), and a scheme-less address is assumed to be https
 * rather than guessed at.
 */
export function safeExternalUrl(value: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A bare word ("Router", "intern") is not an address.
  if (!url.hostname.includes(".")) return null;
  return url.toString();
}

/** Whether a label/value pair should render as a link rather than as text. */
export function linkTarget(label: string, value: string): string | null {
  const looksLikeUrl = URL_LABEL.test(label.trim()) || /^https?:\/\//i.test(value);
  return looksLikeUrl ? safeExternalUrl(value) : null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** Copy-to-clipboard button with a short "copied" confirmation. */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context, denied permission);
      // the value stays selectable on screen.
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} kopiert` : `${label} kopieren`}
      data-testid="credential-copy"
      className={cn(
        "shrink-0 rounded-ordilo-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5" style={{ color: "var(--petrol)" }} aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** A label/value row: link when the value is an address, always copyable. */
export function CredentialRow({ label, value }: { label: string; value: string }) {
  const href = linkTarget(label, value);

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="credential-link"
            className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-[var(--petrol)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <span className="min-w-0 truncate text-right text-sm font-medium text-foreground">
            {value}
          </span>
        )}
        <CopyButton value={value} label={label} />
      </dd>
    </div>
  );
}

/**
 * The password row.
 *
 * The plaintext is never part of the surrounding data — not in the card
 * the model produced, not in the document row. It is fetched from the
 * reveal endpoint when the family member asks for it, and can then be
 * read or copied straight into the login form. Revealed, it wraps instead
 * of truncating: a password that cannot be read in full is only half
 * useful when copying is not an option (second device, TV, phone call).
 */
export function SecretValueRow({ documentId }: { documentId: string }) {
  const { revealed, show, loading, copied, error, reveal, toggleShow, copy } =
    useSecretReveal(documentId);

  return (
    <div data-testid="credential-secret">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="shrink-0 text-sm text-muted-foreground">Passwort</dt>
        <dd className="flex min-w-0 items-start gap-1">
          {revealed == null ? (
            <button
              type="button"
              onClick={reveal}
              disabled={loading}
              data-testid="credential-secret-reveal"
              className="inline-flex items-center gap-1.5 rounded-ordilo-sm px-1.5 py-0.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
              Anzeigen
            </button>
          ) : (
            <>
              <span
                className="min-w-0 break-all text-right font-mono text-sm text-foreground"
                data-testid="credential-secret-value"
              >
                {show ? revealed : "••••••••"}
              </span>
              <button
                type="button"
                onClick={toggleShow}
                aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
                className="shrink-0 rounded-ordilo-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {show ? (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? "Passwort kopiert" : "Passwort kopieren"}
                data-testid="credential-secret-copy"
                className="shrink-0 rounded-ordilo-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {copied ? (
                  <Check
                    className="size-3.5"
                    style={{ color: "var(--petrol)" }}
                    aria-hidden="true"
                  />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </>
          )}
        </dd>
      </div>
      {error && (
        <p
          className="mt-1 text-right text-xs text-destructive"
          data-testid="credential-secret-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
