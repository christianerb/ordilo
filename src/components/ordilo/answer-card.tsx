"use client";

import { useCallback, useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Loader2,
  FileText,
  Info,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSecretReveal } from "@/lib/hooks/use-secret-reveal";
import type {
  AnswerCard as AnswerCardData,
  AnswerCardField,
} from "@/lib/schemas/chat";

const CARD_TYPE_ICON: Record<AnswerCardData["type"], LucideIcon> = {
  termin: CalendarDays,
  aufgabe: ListChecks,
  dokument: FileText,
  zugangsdaten: KeyRound,
  allgemein: Info,
};

const CARD_TYPE_ACTION_LABEL: Record<AnswerCardData["type"], string> = {
  termin: "Zum Termin",
  aufgabe: "Zur Aufgabe",
  dokument: "Zum Dokument",
  zugangsdaten: "Zum Dokument",
  allgemein: "Zum Dokument",
};

// ---------------------------------------------------------------------------
// Credentials card helpers
// ---------------------------------------------------------------------------

/** Field labels that mark a value as the address of the login page. */
const URL_LABEL = /^(url|adresse|website|webseite|seite|link|portal)$/i;

/**
 * Turn a field value into an external link target, or null if it is not a
 * safe one.
 *
 * The value reaches us through the model, from text the OCR pipeline read
 * off a document — so it is untrusted. Anything but http(s) is refused
 * (a `javascript:` value would otherwise become a clickable script), and
 * a scheme-less address is assumed to be https rather than guessed at.
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

/** Whether this field should render as a link rather than as text. */
function linkTarget(field: AnswerCardField): string | null {
  const looksLikeUrl =
    URL_LABEL.test(field.label.trim()) || /^https?:\/\//i.test(field.value);
  return looksLikeUrl ? safeExternalUrl(field.value) : null;
}

/** Copy-to-clipboard button with a short "copied" confirmation. */
function CopyButton({ value, label }: { value: string; label: string }) {
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
      data-testid="answer-card-copy"
      className="shrink-0 rounded-ordilo-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {copied ? (
        <Check className="size-3.5" style={{ color: "var(--petrol)" }} aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * The password row of a credentials card.
 *
 * The plaintext is never part of the card data — the model never sees it.
 * It is fetched from the reveal endpoint when the family member asks for
 * it, and can then be shown or copied straight into the login form.
 */
function SecretRow({ documentId }: { documentId: string }) {
  const { revealed, show, loading, copied, error, reveal, toggleShow, copy } =
    useSecretReveal(documentId);

  return (
    <div data-testid="answer-card-secret">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="shrink-0 text-sm text-muted-foreground">Passwort</dt>
        <dd className="flex min-w-0 items-center gap-1">
          {revealed == null ? (
            <button
              type="button"
              onClick={reveal}
              disabled={loading}
              data-testid="answer-card-secret-reveal"
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
                className="min-w-0 truncate font-mono text-sm text-foreground"
                data-testid="answer-card-secret-value"
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
                data-testid="answer-card-secret-copy"
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
          data-testid="answer-card-secret-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export interface AnswerCardProps {
  card: AnswerCardData;
  /** Called when the action button is clicked (only rendered when `card.actionDocumentId` is set). */
  onActionClick?: (documentId: string) => void;
  className?: string;
}

/**
 * Answer Card — renders a single structured result (e.g. an appointment,
 * a task, a document fact) as a compact card with a title, optional
 * subtitle, label/value detail fields, and an optional action button
 * linking to the source document.
 *
 * Emitted by the assistant via the `present_answer_card` tool for
 * questions whose answer is exactly one concrete result (VAL-CHAT design
 * refresh: structured answer cards). Replaces free-flowing Markdown text
 * for these cases.
 *
 * @example
 * <AnswerCard
 *   card={{
 *     type: "termin",
 *     title: "Zahnarzttermin",
 *     subtitle: "Emma",
 *     fields: [{ label: "Datum", value: "12.08.2026" }],
 *     actionDocumentId: "doc-123",
 *   }}
 *   onActionClick={(id) => router.push(`/dokumente?doc=${id}`)}
 * />
 */
export function AnswerCard({ card, onActionClick, className }: AnswerCardProps) {
  const Icon = CARD_TYPE_ICON[card.type] ?? Info;
  const actionLabel = CARD_TYPE_ACTION_LABEL[card.type] ?? "Zum Dokument";
  // A credentials card turns its rows into working controls: the address
  // opens, every value copies, and the password can be revealed — the
  // point of the card is that nobody has to retype a login by hand.
  const isCredentials = card.type === "zugangsdaten";
  const showSecretRow = isCredentials && card.hasSecret && Boolean(card.actionDocumentId);

  return (
    <div
      data-testid="answer-card"
      data-card-type={card.type}
      className={cn(
        "w-full rounded-ordilo-md border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <Icon className="size-5" style={{ color: "var(--petrol)" }} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{card.title}</p>
          {card.subtitle && (
            <p className="truncate text-sm text-muted-foreground">{card.subtitle}</p>
          )}
        </div>
      </div>

      {(card.fields.length > 0 || showSecretRow) && (
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
          {card.fields.map((field, i) => {
            const href = isCredentials ? linkTarget(field) : null;

            return (
              <div key={i} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-sm text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="flex min-w-0 items-center gap-1">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="answer-card-link"
                      className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-[var(--petrol)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="truncate">{field.value}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-right text-sm font-medium text-foreground">
                      {field.value}
                    </span>
                  )}
                  {isCredentials && <CopyButton value={field.value} label={field.label} />}
                </dd>
              </div>
            );
          })}
          {showSecretRow && <SecretRow documentId={card.actionDocumentId!} />}
        </dl>
      )}

      {card.actionDocumentId && (
        <button
          type="button"
          onClick={() => onActionClick?.(card.actionDocumentId!)}
          data-testid="answer-card-action"
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-ordilo-sm bg-[var(--petrol)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {actionLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
