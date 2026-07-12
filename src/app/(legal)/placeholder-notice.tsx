import { AlertTriangle } from "lucide-react";

/**
 * Visible banner on legal pages whose content still contains
 * [bracketed] dummy data. Stays until the real operator details are
 * filled in — a legal page that LOOKS finished but isn't would be worse
 * than an obvious placeholder.
 */
export function PlaceholderNotice() {
  return (
    <div
      className="flex items-start gap-2 rounded-ordilo-sm border border-[var(--apricot)]/30 bg-[var(--apricot)]/5 p-3"
      data-testid="legal-placeholder-notice"
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-[var(--apricot)]"
        aria-hidden="true"
      />
      <p className="text-sm">
        <strong>Platzhalter:</strong> Alle Angaben in [Klammern] sind
        Beispieldaten und werden vor dem Launch durch die echten Angaben
        ersetzt.
      </p>
    </div>
  );
}
