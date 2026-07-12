import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";

/**
 * Legal pages layout (Impressum, Datenschutz) — public, minimal chrome:
 * a small header back to the landing page and a readable text column.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--warm-white)] text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm">
          <OrdiloMascot size={28} mood="idle" style={{ color: "var(--petrol)" }} />
          <span className="text-lg font-semibold tracking-tight">Ordilo</span>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-ordilo-sm px-3 py-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--sand)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zur Startseite
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-4">
        {children}
      </main>
    </div>
  );
}
