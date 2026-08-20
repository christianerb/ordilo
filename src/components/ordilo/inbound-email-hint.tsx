"use client";

import { Mail } from "lucide-react";
import { CopyButton } from "@/components/ordilo/credential-fields";

/**
 * The family's private inbound address, shown where people actually look.
 *
 * The same address lives in the family settings, but nobody opens settings
 * to forward an email — so the family page and the home screen each carry
 * one quiet card with the address and a copy button.
 */
export function InboundEmailHint({ address }: { address: string }) {
  return (
    <section
      data-testid="inbound-email-hint"
      className="rounded-ordilo-md border border-white/80 bg-[var(--surface-box)] px-4 py-3 shadow-card"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--wash-sage)]"
          aria-hidden="true"
        >
          <Mail
            className="size-4"
            style={{ color: "var(--petrol)" }}
            strokeWidth={1.8}
          />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Per E-Mail an Ordilo
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Leite Dokumente hierhin weiter — oder schreib einfach, was ansteht.
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1 rounded-ordilo-sm bg-[var(--sand-light)] px-3 py-2">
        <p className="min-w-0 flex-1 select-all break-all text-sm font-medium text-foreground">
          {address}
        </p>
        <CopyButton value={address} label="E-Mail-Adresse" />
      </div>
    </section>
  );
}
