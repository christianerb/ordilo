import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Check,
  ChevronDown,
  Mic2,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PurchasesPackage } from "react-native-purchases";

import { OrdiloButton } from "@/src/components/ui";
import { getApiUrl } from "@/src/lib/api";
import { useBilling } from "@/src/lib/billing";
import {
  subscriptionPriceLabel,
  subscriptionRenewalText,
} from "@/src/lib/subscription-disclosure";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

function packageLabel(item: PurchasesPackage): string {
  if (item.packageType === "ANNUAL") return "Jährlich";
  if (item.packageType === "MONTHLY") return "Monatlich";
  return item.product.title;
}

function packageDetail(item: PurchasesPackage): string {
  if (item.packageType === "ANNUAL" && item.product.pricePerMonthString) {
    return `Entspricht ${item.product.pricePerMonthString} pro Monat`;
  }
  return item.product.priceString;
}

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { error, isLoading, offering, purchase, refresh, restore } = useBilling();
  const packages = useMemo(() => {
    if (!offering) return [];
    const preferred = [offering.annual, offering.monthly].filter(
      (item): item is PurchasesPackage => item !== null,
    );
    return preferred.length > 0 ? preferred : offering.availablePackages;
  }, [offering]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(
    packages[0] ?? null,
  );
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [purchasePending, setPurchasePending] = useState(false);

  const chosen =
    selected && packages.some((item) => item.identifier === selected.identifier)
      ? selected
      : packages[0] ?? null;

  async function buy() {
    if (!chosen || busy) return;
    setBusy("purchase");
    setMessage(null);
    try {
      const result = await purchase(chosen);
      if (result === "purchased") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else if (result === "pending") {
        setPurchasePending(true);
        setMessage(
          "Dein Abo ist aktiv. Die Bestätigung dauert noch einen Moment. Bitte prüfe es erneut.",
        );
      }
    } catch {
      setMessage("Der Kauf hat nicht geklappt. Bitte versuch es nochmal.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(null);
    }
  }

  async function restorePurchase() {
    if (busy) return;
    setBusy("restore");
    setMessage(null);
    try {
      if (await restore()) {
        setMessage("Dein Abo ist wieder da.");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else {
        setMessage("Wir haben kein aktives Abo gefunden.");
      }
    } catch {
      setMessage("Wiederherstellen hat nicht geklappt.");
    } finally {
      setBusy(null);
    }
  }

  async function openLegal(path: "/datenschutz" | "/nutzungsbedingungen") {
    await WebBrowser.openBrowserAsync(`${getApiUrl()}${path}`);
  }

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityLabel="Schließen"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.back()}
        style={[styles.close, { top: Math.max(insets.top, spacing.md) }]}
      >
        <ChevronDown color={colors.graphite} size={24} />
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.demoCard}>
            <View style={styles.micCircle}>
              <Mic2 color={colors.warmWhite} size={28} strokeWidth={2} />
            </View>
            <View style={styles.wave} accessibilityElementsHidden>
              {[18, 31, 23, 39, 27, 34, 20].map((height, index) => (
                <View key={`${height}-${index}`} style={[styles.waveBar, { height }]} />
              ))}
            </View>
            <Text style={styles.demoText}>„Wann ist der Elternabend?“</Text>
          </View>
          <Text style={styles.eyebrow}>Ordilo Plus</Text>
          <Text style={styles.title}>Frag einfach. Ordilo hört zu.</Text>
          <Text style={styles.subtitle}>
            Führe ein Live-Gespräch über eure Familienunterlagen.
            Die normale Diktierfunktion bleibt kostenlos.
          </Text>
        </View>

        <View style={styles.benefits}>
          {[
            [Mic2, "Live mit Ordilo sprechen"],
            [Sparkles, "Gesprochene Antworten mit Fundstellen"],
            [ShieldCheck, "Ein Abo für eure ganze Familie"],
          ].map(([Icon, label]) => {
            const BenefitIcon = Icon as typeof Mic2;
            return (
              <View key={label as string} style={styles.benefit}>
                <View style={styles.benefitIcon}>
                  <BenefitIcon color={colors.harborBlue} size={20} strokeWidth={1.9} />
                </View>
                <Text style={styles.benefitText}>{label as string}</Text>
              </View>
            );
          })}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.harborBlue} style={styles.loader} />
        ) : packages.length > 0 ? (
          <View accessibilityRole="radiogroup" style={styles.plans}>
            {packages.map((item) => {
              const active = chosen?.identifier === item.identifier;
              return (
                <Pressable
                  accessibilityLabel={subscriptionPriceLabel(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  key={item.identifier}
                  onPress={() => setSelected(item)}
                  style={[styles.plan, active && styles.planActive]}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <Check color={colors.warmWhite} size={14} strokeWidth={3} /> : null}
                  </View>
                  <View style={styles.planCopy}>
                    <Text style={styles.planTitle}>{packageLabel(item)}</Text>
                    <Text style={styles.planDetail}>{packageDetail(item)}</Text>
                  </View>
                  <Text style={styles.planPrice}>{subscriptionPriceLabel(item)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error ?? "Zurzeit ist kein Abo verfügbar."}</Text>
            <OrdiloButton onPress={() => void refresh()} title="Erneut versuchen" variant="outline" />
          </View>
        )}

        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}

        <OrdiloButton
          disabled={!chosen || busy !== null}
          onPress={() =>
            purchasePending ? void restorePurchase() : void buy()
          }
          size="lg"
          title={
            busy
              ? "Wird geprüft …"
              : purchasePending
                ? "Abo erneut prüfen"
                : "Mit Ordilo Plus weiter"
          }
        />
        <Text style={styles.renewal}>
          {subscriptionRenewalText(chosen)}
        </Text>
        <View style={styles.links}>
          <Pressable disabled={busy !== null} onPress={() => void restorePurchase()}>
            <Text style={styles.link}>
              {busy === "restore" ? "Wird gesucht …" : "Käufe wiederherstellen"}
            </Text>
          </Pressable>
          <Pressable onPress={() => void openLegal("/nutzungsbedingungen")}>
            <Text style={styles.link}>Bedingungen</Text>
          </Pressable>
          <Pressable onPress={() => void openLegal("/datenschutz")}>
            <Text style={styles.link}>Datenschutz</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.warmWhite, flex: 1 },
  close: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: spacing.md,
    width: 40,
    zIndex: 2,
  },
  content: {
    alignSelf: "center",
    gap: spacing.md,
    maxWidth: 520,
    paddingHorizontal: spacing.lg,
    paddingTop: 76,
    width: "100%",
  },
  hero: { alignItems: "center", gap: spacing.sm },
  demoCard: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    width: "100%",
  },
  micCircle: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  wave: { alignItems: "center", flexDirection: "row", gap: 5, height: 40 },
  waveBar: { backgroundColor: colors.harborBlue, borderRadius: 3, width: 4 },
  demoText: { color: colors.mistDark, ...typography.timestamp },
  eyebrow: { color: colors.harborBlue, ...typography.caption },
  title: {
    color: colors.harborBlueDarker,
    fontFamily: typography.largeTitle.fontFamily,
    fontSize: 30,
    letterSpacing: -0.5,
    lineHeight: 35,
    textAlign: "center",
  },
  subtitle: {
    color: colors.mistDark,
    maxWidth: 380,
    textAlign: "center",
    ...typography.body,
  },
  benefits: { gap: spacing.sm, paddingVertical: spacing.sm },
  benefit: { alignItems: "center", flexDirection: "row", gap: 12 },
  benefitIcon: {
    alignItems: "center",
    backgroundColor: colors.harborTint,
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  benefitText: { color: colors.graphite, flex: 1, ...typography.title },
  plans: { gap: spacing.sm },
  plan: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    padding: 12,
  },
  planActive: { backgroundColor: colors.harborTint, borderColor: colors.harborBlue },
  radio: {
    alignItems: "center",
    borderColor: colors.mist,
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  radioActive: { backgroundColor: colors.harborBlue, borderColor: colors.harborBlue },
  planCopy: { flex: 1 },
  planTitle: { color: colors.graphite, ...typography.title },
  planDetail: { color: colors.mistDark, ...typography.label },
  planPrice: { color: colors.graphite, ...typography.headline },
  loader: { marginVertical: spacing.xl },
  errorCard: {
    backgroundColor: colors.sand,
    borderRadius: radii.sm,
    gap: spacing.md,
    padding: spacing.md,
  },
  errorText: { color: colors.mistDark, textAlign: "center", ...typography.timestamp },
  message: { color: colors.mistDark, textAlign: "center", ...typography.timestamp },
  renewal: { color: colors.mistDark, textAlign: "center", ...typography.label },
  links: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "center",
  },
  link: { color: colors.harborBlue, ...typography.label },
});
