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
import { AppState, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { ShieldCheck } from "lucide-react-native";

import { OrdiloMark } from "@/src/components/ordilo-mark";
import { OrdiloButton } from "@/src/components/ui";
import {
  decideOnColdStart,
  decideOnLeaveForeground,
  decideOnReturnToForeground,
} from "@/src/lib/app-lock-policy";
import {
  authenticateToUnlock,
  getBiometrySupport,
  type BiometrySupport,
} from "@/src/lib/biometrics";
import { haptics } from "@/src/lib/haptics";
import { REDUCE_MOTION } from "@/src/lib/motion";
import {
  defaultAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "@/src/lib/settings";
import { colors, spacing, typography } from "@/src/theme/tokens";

interface AppLockContextValue {
  settings: AppSettings;
  biometry: BiometrySupport;
  /** False until persisted settings are loaded — toggle UIs wait for it. */
  hydrated: boolean;
  /** True while the lock screen covers the app. */
  locked: boolean;
  setAppLockEnabled: (enabled: boolean) => Promise<boolean>;
  setPrivacyShieldEnabled: (enabled: boolean) => Promise<void>;
  /** Ask for biometrics now; resolves true when the user passed. */
  unlock: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextValue>({
  settings: defaultAppSettings,
  biometry: { available: false, label: "Biometrie" },
  hydrated: false,
  locked: false,
  setAppLockEnabled: async () => false,
  setPrivacyShieldEnabled: async () => {},
  unlock: async () => false,
});

export function useAppLock(): AppLockContextValue {
  return useContext(AppLockContext);
}

/**
 * App-wide privacy layer:
 *
 * - **Privacy shield** — while the app is in the app switcher or a
 *   transient interruption, a calm warm-white cover with the Ordilo mark
 *   hides the family content (the switcher snapshot is taken during
 *   `inactive`, so the shield has to be up by then).
 * - **Biometric app lock** — when enabled, leaving the app arms the
 *   lock; returning shows a lock screen and asks for Face ID / Touch ID
 *   (device passcode stays as system fallback).
 *
 * The decisions live in `app-lock-policy.ts` (pure, unit-tested); this
 * provider only wires them to AppState and the UI.
 */
export function AppLockProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [biometry, setBiometry] = useState<BiometrySupport>({
    available: false,
    label: "Biometrie",
  });
  const [hydrated, setHydrated] = useState(false);
  const [shielded, setShielded] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockArmedRef = useRef(false);
  const authInFlightRef = useRef(false);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (authInFlightRef.current) return false;
    authInFlightRef.current = true;
    try {
      const passed = await authenticateToUnlock(
        "Entsperre Ordilo, um deine Familiendokumente zu sehen.",
      );
      if (passed) {
        haptics.success();
        setLocked(false);
      }
      return passed;
    } finally {
      authInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [stored, support] = await Promise.all([
        loadAppSettings(),
        getBiometrySupport(),
      ]);
      // Cold start: no background→active transition ever fires for a
      // freshly launched process, so an enabled lock must engage here.
      const cold = decideOnColdStart({
        appLockEnabled: stored.appLockEnabled,
        biometryAvailable: support.available,
      });
      if (stored.appLockEnabled && !cold.keepAppLockEnabled) {
        // Biometrics vanished since the user enabled the lock — disable
        // it rather than risk locking them out of their own device.
        try {
          setSettings(await saveAppSettings({ appLockEnabled: false }));
        } catch {
          // The device no longer supports the stored lock. Continue with
          // the safe in-memory setting even if SecureStore is unavailable.
          setSettings({ ...stored, appLockEnabled: false });
        }
      } else {
        setSettings(stored);
      }
      setBiometry(support);
      setHydrated(true);
      if (cold.locked) {
        setLocked(true);
        // Prompt right away — the system sheet over the lock screen is
        // the fastest path back into the app.
        void unlock();
      }
    })();
  }, [unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      // AppStateStatus includes "unknown"/"extension" on some platforms —
      // treat anything that is neither active nor background as a
      // transient interruption (same class as iOS `inactive`).
      if (next === "active") {
        const decision = decideOnReturnToForeground({
          lockArmed: lockArmedRef.current,
        });
        lockArmedRef.current = decision.lockArmed;
        setShielded(decision.shielded);
        if (decision.locked) {
          setLocked(true);
          // Prompt immediately — the system sheet is the fastest way back
          // in, and the lock screen stays as its calm backdrop.
          void unlock();
        }
        return;
      }
      const decision = decideOnLeaveForeground({
        appLockEnabled: settings.appLockEnabled,
        privacyShieldEnabled: settings.privacyShieldEnabled,
        next: next === "background" ? "background" : "inactive",
      });
      if (decision.lockArmed) lockArmedRef.current = true;
      if (decision.shielded) setShielded(true);
    });
    return () => subscription.remove();
  }, [settings.appLockEnabled, settings.privacyShieldEnabled, unlock]);

  /**
   * Enabling the lock asks for biometrics right away — the toggle only
   * turns on for the person who can actually pass, and the system sheet
   * doubles as confirmation that the hardware works.
   */
  const setAppLockEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (enabled) {
        if (!biometry.available) {
          haptics.warning();
          return false;
        }
        const passed = await authenticateToUnlock(
          "Aktiviere die App-Sperre für Ordilo.",
        );
        if (!passed) return false;
        haptics.success();
      }
      try {
        setSettings(await saveAppSettings({ appLockEnabled: enabled }));
        return true;
      } catch {
        haptics.error();
        return false;
      }
    },
    [biometry.available],
  );

  const setPrivacyShieldEnabled = useCallback(async (enabled: boolean) => {
    try {
      setSettings(await saveAppSettings({ privacyShieldEnabled: enabled }));
    } catch {
      haptics.error();
    }
  }, []);

  const value = useMemo<AppLockContextValue>(
    () => ({
      settings,
      biometry,
      hydrated,
      locked,
      setAppLockEnabled,
      setPrivacyShieldEnabled,
      unlock,
    }),
    [
      settings,
      biometry,
      hydrated,
      locked,
      setAppLockEnabled,
      setPrivacyShieldEnabled,
      unlock,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {hydrated && (shielded || locked) ? (
        <Animated.View
          entering={FadeIn.duration(140).reduceMotion(REDUCE_MOTION)}
          pointerEvents={locked ? "auto" : "none"}
          style={styles.cover}
        >
          {locked ? (
            <LockScreen biometryLabel={biometry.label} onUnlock={unlock} />
          ) : (
            <ShieldCover />
          )}
        </Animated.View>
      ) : null}
    </AppLockContext.Provider>
  );
}

/** The app-switcher cover: brand mark, nothing else — calm, not a vault. */
function ShieldCover() {
  return (
    <View style={styles.shield}>
      <OrdiloMark size={72} />
    </View>
  );
}

function LockScreen({
  biometryLabel,
  onUnlock,
}: {
  biometryLabel: string;
  onUnlock: () => Promise<boolean>;
}) {
  return (
    <View style={styles.lockScreen}>
      <Animated.View
        entering={FadeInDown.springify()
          .damping(15)
          .stiffness(140)
          .reduceMotion(REDUCE_MOTION)}
        style={styles.lockContent}
      >
        <View style={styles.lockMarkCircle}>
          <OrdiloMark size={72} />
        </View>
        <Text style={[typography.display, styles.lockTitle]}>
          Ordilo ist gesperrt
        </Text>
        <Text style={[typography.body, styles.lockText]}>
          Die Dokumente deiner Familie bleiben geschützt, bis du zurück bist.
        </Text>
        <OrdiloButton
          icon={<ShieldCheck color={colors.warmWhite} size={18} strokeWidth={2} />}
          onPress={() => void onUnlock()}
          size="lg"
          title={`Mit ${biometryLabel} entsperren`}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    backgroundColor: colors.warmWhite,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 100,
  },
  shield: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  lockScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  lockContent: {
    alignItems: "center",
    gap: spacing.md,
    maxWidth: 320,
  },
  lockMarkCircle: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: 64,
    height: 128,
    justifyContent: "center",
    marginBottom: spacing.sm,
    width: 128,
  },
  lockTitle: {
    color: colors.graphite,
    textAlign: "center",
  },
  lockText: {
    color: colors.mistDark,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
});
