"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";

import { useMountEffect } from "@/lib/hooks/use-mount-effect";

import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import { Button } from "@/components/ui/button";
import {
  fetchAiDataSharingStatus,
  recordAiDataSharingDecision,
  type AiDataSharingStatus,
} from "@/lib/ai/consent-client";

/**
 * Holds the user's explicit decision about third-party AI processing
 * (Apple App Review Guideline 5.1.2(i)) and presents the one consent
 * drawer that collects it.
 *
 * Every AI-bound action — scan upload, chat question, dictation, live
 * conversation — goes through `ensureAiConsent()` first:
 *
 *   if (!(await ensureAiConsent())) return;
 *
 * With consent on record it resolves immediately. Otherwise the drawer
 * opens and the promise settles with the user's choice. The server
 * enforces the same rule, so a refusal here is never the only gate.
 *
 * Declining (or dismissing the drawer) changes nothing else: family,
 * plan, documents and settings keep working — only the AI features wait.
 */

interface AiConsentContextValue {
  /** The recorded decision; null while loading or when never asked. */
  status: AiDataSharingStatus;
  /** True until the first status lookup for the signed-in user finished. */
  isLoading: boolean;
  /**
   * Resolve true when AI processing may start. Shows the consent drawer
   * when there is no granted decision yet and settles with the choice.
   */
  ensureAiConsent: () => Promise<boolean>;
  /** Open the drawer from the settings to review or change the decision. */
  reviewAiConsent: () => void;
  /** Re-read the decision from the server. */
  refreshAiConsent: () => Promise<void>;
}

const AiConsentContext = createContext<AiConsentContextValue>({
  status: null,
  isLoading: false,
  // Outside the provider the gate stays transparent: production always
  // mounts the provider in the AppShell (only tests render the consumers
  // bare), and the AI routes enforce consent server-side regardless.
  ensureAiConsent: async () => true,
  reviewAiConsent: () => {},
  refreshAiConsent: async () => {},
});

export function AiConsentProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<AiDataSharingStatus>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const resolversRef = useRef<((granted: boolean) => void)[]>([]);
  // ensureAiConsent reads status through this ref so the version waiting
  // on the initial fetch never decides with a stale null.
  const statusRef = useRef<AiDataSharingStatus>(null);
  // The in-flight (or last completed) status read; the gate awaits it
  // before treating "no status" as "no decision".
  const readInFlightRef = useRef<Promise<void> | null>(null);

  const setStatus = useCallback((next: AiDataSharingStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const refreshAiConsent = useCallback(() => {
    const read = (async () => {
      try {
        setStatus(await fetchAiDataSharingStatus());
      } catch {
        // Offline or API down: keep the last known status. The AI routes
        // enforce consent server-side, so a stale local status never lets
        // unconsented data out.
      } finally {
        setIsLoading(false);
      }
    })();
    readInFlightRef.current = read;
    return read;
  }, [setStatus]);

  // Mount-only status read; refreshAiConsent has no reactive deps and
  // consumers can re-trigger it via `refreshAiConsent` from the context.
  useMountEffect(() => {
    void refreshAiConsent();
  });

  const resolveAll = useCallback((granted: boolean) => {
    const pending = resolversRef.current;
    resolversRef.current = [];
    for (const resolve of pending) resolve(granted);
  }, []);

  const ensureAiConsent = useCallback((): Promise<boolean> => {
    const decide = (): Promise<boolean> => {
      if (statusRef.current === "granted") return Promise.resolve(true);
      const result = new Promise<boolean>((resolve) => {
        resolversRef.current.push(resolve);
      });
      setSaveError(null);
      setOpen(true);
      return result;
    };
    // Cold-load race: while the initial GET is still pending, status is
    // null even for a consenting user. Wait for that read first so the
    // drawer never opens for someone who already agreed.
    const pending = readInFlightRef.current;
    return pending ? pending.then(decide) : decide();
  }, []);

  const reviewAiConsent = useCallback(() => {
    setSaveError(null);
    setOpen(true);
  }, []);

  const choose = useCallback(
    async (decision: "granted" | "declined") => {
      if (saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const recorded = await recordAiDataSharingDecision(decision);
        setStatus(recorded);
        setOpen(false);
        resolveAll(recorded === "granted");
      } catch (error) {
        // Keep the drawer open: an unrecorded decision must not silently
        // unlock AI processing.
        setSaveError(
          error instanceof Error
            ? error.message
            : "Deine Einstellung konnte nicht gespeichert werden. Bitte versuch es nochmal.",
        );
      } finally {
        setSaving(false);
      }
    },
    [resolveAll, saving, setStatus],
  );

  // Closing the drawer without a choice is not a decision: nothing is
  // recorded and the waiting action is cancelled. The next AI action
  // asks again.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (saving) return;
        setOpen(false);
        resolveAll(false);
        return;
      }
      setOpen(true);
    },
    [resolveAll, saving],
  );

  const value = useMemo<AiConsentContextValue>(
    () => ({
      status,
      isLoading,
      ensureAiConsent,
      reviewAiConsent,
      refreshAiConsent,
    }),
    [status, isLoading, ensureAiConsent, reviewAiConsent, refreshAiConsent],
  );

  return (
    <AiConsentContext.Provider value={value}>
      {children}
      <OrdiloDrawer
        variant="form"
        open={open}
        onOpenChange={handleOpenChange}
        dismissible={!saving}
        data-testid="ai-consent-drawer"
      >
        <OrdiloDrawerHeader
          title="Bevor Ordilo mitdenkt"
          description="Einwilligung zur KI-Verarbeitung"
          descriptionHidden
        />
        <OrdiloDrawerBody>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)] text-white"
                aria-hidden="true"
              >
                <ShieldCheck className="size-5" strokeWidth={2} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ordilo liest deine Dokumente und beantwortet Fragen mit zwei
                Diensten: OpenAI (Analyse, Antworten, Sprache) und Datalab
                (Texterkennung). Dafür werden Inhalte an diese Dienste
                übertragen. Sie dürfen sie nur für Ordilo verarbeiten, nicht
                für ihr eigenes Training.
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Du kannst deine Entscheidung jederzeit in den Einstellungen
              ändern. Ohne Zustimmung bleiben Scannen, Fragen und
              Spracheingabe aus — alles andere funktioniert.
            </p>
            <Link
              href="/datenschutz"
              className="self-start text-sm font-medium text-[var(--petrol)] underline underline-offset-4 focus-ring"
            >
              Datenschutzerklärung lesen
            </Link>
            {saveError ? (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : null}
          </div>
        </OrdiloDrawerBody>
        <OrdiloDrawerFooter className="flex-col sm:flex-col">
          <Button
            size="lg"
            onClick={() => void choose("granted")}
            disabled={saving}
            data-testid="ai-consent-accept"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Einen Moment …
              </>
            ) : (
              "Zustimmen"
            )}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => void choose("declined")}
            disabled={saving}
            data-testid="ai-consent-decline"
          >
            Ablehnen
          </Button>
        </OrdiloDrawerFooter>
      </OrdiloDrawer>
    </AiConsentContext.Provider>
  );
}

export function useAiConsent(): AiConsentContextValue {
  return useContext(AiConsentContext);
}
