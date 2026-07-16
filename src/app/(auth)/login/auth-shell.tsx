import { BellRing, Camera, ShieldCheck, Sparkles } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";

interface AuthShellProps {
  children: React.ReactNode;
  compact?: boolean;
}

const FEATURES = [
  { label: "Scannen", icon: Camera },
  { label: "Fragen", icon: Sparkles },
  { label: "Erinnert werden", icon: BellRing },
] as const;

export function AuthShell({ children, compact = false }: AuthShellProps) {
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--auth-background)] px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
      <div
        className="pointer-events-none absolute -left-20 top-[18%] h-52 w-52 rounded-full bg-[var(--auth-blue-wash)] sm:-left-12 sm:h-64 sm:w-64"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-[28px] bg-[var(--auth-sage-wash)] sm:right-[8%] sm:-top-36 sm:h-96 sm:w-96 sm:rotate-12"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 left-[7%] h-64 w-80 rounded-[28px] bg-[var(--auth-apricot-wash)] sm:h-80 sm:w-[28rem] sm:-rotate-6"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[8%] right-[8%] size-24 rounded-full bg-[var(--auth-blue-wash)]"
        aria-hidden="true"
      />

      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--auth-surface)] shadow-card lg:grid-cols-[1.08fr_0.92fr]">
        <div
          className={`relative flex flex-col bg-[var(--auth-story-surface)] px-6 py-6 sm:px-10 sm:py-8 lg:min-h-[600px] lg:px-12 lg:py-10 ${
            compact ? "max-lg:pb-5" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xl font-semibold tracking-[-0.03em] text-[var(--petrol-darker)]">
              ordil<span className="text-[var(--apricot)]">o</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--auth-sage)] px-3 py-1.5 text-xs font-medium text-[var(--petrol-darker)]">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Sicher und vertraulich
            </span>
          </div>

          <div className={`mt-6 max-w-md sm:mt-10 lg:mt-14 ${compact ? "max-lg:hidden" : ""}`}>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
              Frag einfach Ordilo
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
              <span className="sm:hidden">
                Wichtige Dokumente einfach im Blick.
              </span>
              <span className="hidden sm:inline">
                Der Ordner, der mitdenkt: Dokumente scannen, alles wiederfinden,
                keine Frist mehr verpassen.
              </span>
            </p>

            <div className="mt-4 flex flex-wrap gap-2.5 sm:mt-5" aria-label="Ordilo Funktionen">
              {FEATURES.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-ordilo-sm bg-white/70 px-2.5 py-2 text-xs font-medium text-[var(--mist-dark)]"
                >
                  <Icon className="size-3.5 text-[var(--petrol)]" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div
            className={`relative mt-5 flex min-h-36 flex-1 items-end justify-center overflow-hidden rounded-ordilo-md bg-[var(--auth-illustration)] sm:mt-7 sm:min-h-52 lg:mt-9 ${
              compact ? "max-lg:hidden" : ""
            }`}
            aria-hidden="true"
          >
            <div className="absolute -left-8 bottom-4 size-32 rounded-full bg-[var(--auth-sage)] opacity-80" />
            <div className="absolute -right-8 bottom-2 h-36 w-48 rotate-6 rounded-[28px] bg-[var(--auth-blue-wash)]" />
            <div className="absolute bottom-8 left-[22%] h-24 w-16 -rotate-6 rounded-ordilo-sm border border-[var(--mist-light)] bg-[var(--warm-white)]" />
            <div className="absolute bottom-12 right-[20%] h-20 w-16 rotate-6 rounded-ordilo-sm border border-[var(--mist-light)] bg-[var(--warm-white)]" />
            <div className="relative mb-6 flex size-28 items-center justify-center rounded-full bg-[var(--warm-white)] text-[var(--petrol)] shadow-card sm:mb-8 sm:size-32">
              <OrdiloMascot size={104} mood="greeting" />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center bg-[var(--auth-surface)] px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
      </section>
    </main>
  );
}
