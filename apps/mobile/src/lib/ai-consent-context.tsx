import * as WebBrowser from "expo-web-browser";
import { ShieldCheck } from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  OrdiloFormFooter,
  OrdiloNestedSheet,
  OrdiloSheetHeader,
} from "@/src/components/sheet";
import { OrdiloButton } from "@/src/components/ui";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { getApiUrl } from "./api";
import {
  fetchAiDataSharingStatus,
  publishAiConsentStatus,
  recordAiDataSharingDecision,
  subscribeAiConsentStatus,
  type AiDataSharingStatus,
} from "./ai-consent";
import { useSession } from "./session";

/**
 * Holds the user's explicit decision about third-party AI processing
 * (Apple App Review Guideline 5.1.2(i)) and presents the one consent
 * sheet that collects it.
 *
 * Every AI-bound action — scan upload, chat question, dictation, live
 * conversation — goes through `ensureAiConsent()` first:
 *
 *   if (!(await ensureAiConsent())) return;
 *
 * With consent on record it resolves immediately. Otherwise the sheet
 * opens and the promise settles with the user's choice. The server
 * enforces the same rule, so a refusal here is never the only gate.
 *
 * Declining (or dismissing the sheet) changes nothing else: family, plan,
 * documents and settings keep working — only the AI features wait.
 *
 * Several providers can be mounted at once — the app root and a
 * native-modal flow like the scan sheet, which renders the sheet inside
 * its own hierarchy. Every status change is broadcast to the other
 * providers, so a decision made inside a modal also lands in the root
 * provider: the next search, dictation, or live action after leaving the
 * modal does not ask again.
 */

interface AiConsentContextValue {
  /** The recorded decision; null while loading or when never asked. */
  status: AiDataSharingStatus;
  /** True until the first status lookup for the signed-in user finished. */
  isLoading: boolean;
  /**
   * Resolve true when AI processing may start. Shows the consent sheet
   * when there is no granted decision yet and settles with the choice.
   */
  ensureAiConsent: () => Promise<boolean>;
  /** Open the sheet from the settings to review or change the decision. */
  reviewAiConsent: () => void;
  /** Re-read the decision from the server. */
  refreshAiConsent: () => Promise<void>;
}

const AiConsentContext = createContext<AiConsentContextValue>({
  status: null,
  isLoading: true,
  ensureAiConsent: async () => false,
  reviewAiConsent: () => {},
  refreshAiConsent: async () => {},
});

export function AiConsentProvider({
  children,
  renderSheet,
  sheetOnScreen = false,
}: {
  children?: ReactNode;
  /**
   * Native-modal flows render the sheet inside their own hierarchy. Without
   * this slot, iOS can present the root sheet underneath the visible modal.
   */
  renderSheet?: (sheet: ReactNode) => ReactNode;
  /**
   * The rendered sheet sits directly on a full screen rather than inside a
   * floating form sheet, so its panel needs its own side inset.
   */
  sheetOnScreen?: boolean;
}) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const [status, setStatusState] = useState<AiDataSharingStatus>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const resolversRef = useRef<((granted: boolean) => void)[]>([]);
  const fetchSeqRef = useRef(0);
  // ensureAiConsent reads status through this ref so the version waiting
  // on the initial fetch never decides with a stale null.
  const statusRef = useRef<AiDataSharingStatus>(null);
  // The in-flight (or last completed) status read; the gate awaits it
  // before treating "no status" as "no decision".
  const readInFlightRef = useRef<Promise<void> | null>(null);

  const setStatus = useCallback((next: AiDataSharingStatus) => {
    statusRef.current = next;
    setStatusState(next);
    publishAiConsentStatus(next);
  }, []);

  // A decision recorded by another mounted provider (e.g. the scan
  // sheet's nested one) is adopted here, so this provider never serves a
  // stale "not asked" while the server already holds the answer.
  useEffect(
    () =>
      subscribeAiConsentStatus((next) => {
        statusRef.current = next;
        setStatusState(next);
      }),
    [],
  );

  const refreshAiConsent = useCallback(() => {
    const read = (async () => {
      const seq = ++fetchSeqRef.current;
      if (!userId) {
        setStatus(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const next = await fetchAiDataSharingStatus();
        if (seq !== fetchSeqRef.current) return;
        setStatus(next);
      } catch {
        // Offline or API down: keep the last known status. The AI routes
        // enforce consent server-side, so a stale local status never lets
        // unconsented data out.
      } finally {
        if (seq === fetchSeqRef.current) setIsLoading(false);
      }
    })();
    readInFlightRef.current = read;
    return read;
  }, [userId, setStatus]);

  useEffect(() => {
    // Deferred to a microtask (the family-context pattern) so the loading
    // state never updates synchronously inside the effect.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refreshAiConsent();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshAiConsent]);

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
      // A question typed into the chat composer leaves the keyboard up,
      // and it would cover the bottom-anchored sheet and its buttons.
      Keyboard.dismiss();
      setSheetOpen(true);
      return result;
    };
    // Cold-start race: while the initial GET is still pending, status is
    // null even for a consenting user. Wait for that read first so the
    // sheet never opens for someone who already agreed.
    const pending = readInFlightRef.current;
    return pending ? pending.then(decide) : decide();
  }, []);

  const reviewAiConsent = useCallback(() => {
    setSaveError(null);
    setSheetOpen(true);
  }, []);

  const choose = useCallback(
    async (decision: "granted" | "declined") => {
      if (saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const recorded = await recordAiDataSharingDecision(decision);
        setStatus(recorded);
        setSheetOpen(false);
        resolveAll(recorded === "granted");
      } catch {
        // Keep the sheet open: an unrecorded decision must not silently
        // unlock AI processing.
        setSaveError(
          "Deine Einstellung konnte nicht gespeichert werden. Bitte versuch es nochmal.",
        );
      } finally {
        setSaving(false);
      }
    },
    [resolveAll, saving, setStatus],
  );

  // Swiping the sheet away is not a decision: nothing is recorded and the
  // waiting action is cancelled. The next AI action asks again.
  const dismiss = useCallback(() => {
    if (saving) return;
    setSheetOpen(false);
    resolveAll(false);
  }, [resolveAll, saving]);

  const openPrivacyPolicy = useCallback(async () => {
    await WebBrowser.openBrowserAsync(`${getApiUrl()}/datenschutz`);
  }, []);

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

  const sheet = (
    <OrdiloNestedSheet
      closeAccessibilityLabel="Einwilligung schließen"
      contained={Boolean(renderSheet)}
      dismissDisabled={saving}
      inset={sheetOnScreen}
      onClose={dismiss}
      visible={sheetOpen}
    >
      <View style={styles.content}>
        <OrdiloSheetHeader title="Bevor Ordilo mitdenkt" />
        <View style={styles.message}>
          <View style={styles.iconCircle}>
            <ShieldCheck color={colors.warmWhite} size={20} strokeWidth={2} />
          </View>
          <Text maxFontSizeMultiplier={1.4} style={styles.text}>
            Ordilo liest deine Dokumente und beantwortet Fragen mit zwei
            Diensten: OpenAI (Analyse, Antworten, Sprache) und Datalab
            (Texterkennung). Dafür werden Inhalte an diese Dienste
            übertragen. Sie dürfen sie nur für Ordilo verarbeiten, nicht
            für ihr eigenes Training.
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.4} style={styles.note}>
          Du kannst deine Entscheidung jederzeit in den Einstellungen ändern.
          Ohne Zustimmung bleiben Scannen, Fragen und Spracheingabe aus —
          alles andere funktioniert.
        </Text>
        <Pressable
          accessibilityLabel="Datenschutzerklärung lesen"
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => void openPrivacyPolicy()}
          style={styles.link}
        >
          <Text maxFontSizeMultiplier={1.4} style={styles.linkText}>
            Datenschutzerklärung lesen
          </Text>
        </Pressable>
        <OrdiloFormFooter
          error={saveError}
          primary={
            <OrdiloButton
              accessibilityLabel="Der KI-Übertragung zustimmen"
              disabled={saving}
              icon={
                saving ? (
                  <ActivityIndicator color={colors.warmWhite} size="small" />
                ) : undefined
              }
              onPress={() => void choose("granted")}
              size="lg"
              title={saving ? "Einen Moment …" : "Zustimmen"}
            />
          }
          secondary={
            <OrdiloButton
              accessibilityLabel="Ablehnen"
              disabled={saving}
              onPress={() => void choose("declined")}
              size="lg"
              title="Ablehnen"
              variant="outline"
            />
          }
        />
      </View>
    </OrdiloNestedSheet>
  );

  return (
    <AiConsentContext.Provider value={value}>
      {renderSheet ? renderSheet(sheet) : children}
      {renderSheet ? null : sheet}
    </AiConsentContext.Provider>
  );
}

export function useAiConsent(): AiConsentContextValue {
  return useContext(AiConsentContext);
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  message: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  text: { color: colors.mistDark, flex: 1, ...typography.body },
  note: { color: colors.mistDark, ...typography.timestamp },
  link: { alignSelf: "flex-start" },
  linkText: {
    color: colors.harborBlue,
    fontFamily: typography.title.fontFamily,
    fontSize: typography.body.fontSize,
    textDecorationLine: "underline",
  },
});
