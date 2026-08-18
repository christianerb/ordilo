"use client";

import { Check, Copy, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The family's private forwarding address. It stays visibly close to the
 * document flow, while a copy action makes forwarding useful on any device.
 */
export function InboundEmailAddressCard({
  email,
  context = "documents",
}: {
  email: string;
  context?: "documents" | "onboarding" | "settings";
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const description =
    context === "onboarding"
      ? "Leite PDFs und Bilder hierher weiter. Sie landen direkt bei euren Dokumenten."
      : "Leite PDFs und Bilder hierher weiter. Ordilo legt sie bei euren Dokumenten ab.";

  return (
    <section
      className="rounded-ordilo-md border border-border bg-[var(--sand)] p-4 shadow-card"
      data-testid="inbound-email-address-card"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/10 text-[var(--petrol)]"
          aria-hidden="true"
        >
          <Mail className="size-4.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            Dokumente per E-Mail
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-ordilo-sm bg-[var(--surface-box)] p-2">
        <p className="min-w-0 flex-1 select-all break-all px-1 text-sm font-medium text-foreground">
          {email}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyAddress()}
          className="size-9 shrink-0 rounded-ordilo-sm"
          aria-label={copied ? "Adresse kopiert" : "E-Mail-Adresse kopieren"}
          title={copied ? "Kopiert" : "Adresse kopieren"}
        >
          {copied ? (
            <Check
              className="size-4 animate-check-pop text-[var(--petrol)]"
              aria-hidden="true"
            />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      <p
        className="mt-2 flex min-h-5 items-center gap-1.5 px-1 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {copied ? (
          <>
            <Check
              className="size-3.5 shrink-0 animate-check-pop text-[var(--petrol)]"
              aria-hidden="true"
            />
            Adresse kopiert. Du kannst sie jetzt beim Weiterleiten einfügen.
          </>
        ) : (
          "Nur eure Familie kann diese Adresse nutzen."
        )}
      </p>
    </section>
  );
}
