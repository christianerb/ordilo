import { useRouter } from "expo-router";
import { ArrowRight, CalendarCheck, FolderOpen, Heart } from "lucide-react-native";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmbientFields } from "@/src/components/ambient-fields";
import { AuthHeroIllustration } from "@/src/components/auth-hero-illustration";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import { OrdiloButton, Screen } from "@/src/components/ui";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * The signed-out intro — the first screen of the app, ahead of the
 * email login. It tells the product story in one glance (wordmark,
 * promise, the character, three plain feature rows) and then hands
 * over: "Loslegen" and "Anmelden" both lead to the email screen,
 * because signing in and signing up are the same act in Ordilo.
 *
 * The One-Screen Rule: the CTA must be visible without scrolling, so
 * short screens (SE class, < 730pt) get the compact rhythm — smaller
 * hero, tighter card — instead of a scrollable marketing page.
 */
export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 730;

  const goToLogin = () => router.push("/(auth)/login");

  return (
    <Screen>
      <View style={styles.canvas}>
        <AmbientFields variant="top" />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollContentCompact,
            {
              paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBlock}>
            <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>
              Ordilo
            </Text>
            <Text style={[styles.tagline, compact && styles.taglineCompact]}>
              Alles Wichtige für deine Familie. An einem Ort.
            </Text>
            <Text style={[styles.intro, compact && styles.introCompact]}>
              Ordilo hilft euch, eure Familienorganisation einfach, sicher
              und entspannt zu meistern.
            </Text>
          </View>

          <AuthHeroIllustration
            scale={compact ? 0.52 : 0.78}
            variant="einstieg"
          />

          <View style={[styles.card, compact && styles.cardCompact]}>
            <View
              style={[styles.cardHeart, compact && styles.cardHeartCompact]}
            >
              <Heart color={colors.harborBlue} size={18} strokeWidth={2} />
            </View>
            <Text
              style={[styles.cardTitle, compact && styles.cardTitleCompact]}
            >
              Deine Familie. Gut organisiert.
            </Text>
            <Text style={[typography.timestamp, styles.cardSubtitle]}>
              Ordilo bringt Struktur in euren Familienalltag — übersichtlich,
              sicher und gemacht für euch.
            </Text>

            <View style={styles.divider} />

            <FeatureRow
              compact={compact}
              icon={<FolderOpen color={colors.harborBlue} size={compact ? 18 : 20} strokeWidth={1.75} />}
              text="Alle wichtigen Unterlagen sicher speichern und jederzeit finden."
              title="Dokumente"
            />
            <View style={styles.rowDivider} />
            <FeatureRow
              compact={compact}
              icon={<CalendarCheck color={colors.harborBlue} size={compact ? 18 : 20} strokeWidth={1.75} />}
              text="Termine, To-dos und Listen teilen und gemeinsam im Blick behalten."
              title="Planen"
            />
            <View style={styles.rowDivider} />
            <FeatureRow
              compact={compact}
              icon={<OrdiloMark size={compact ? 19 : 22} />}
              text="Dein Familienassistent beantwortet Fragen und hilft euch weiter — jederzeit."
              title="Frage Ordilo"
            />
          </View>

          <OrdiloButton
            icon={<ArrowRight color={colors.warmWhite} size={20} />}
            onPress={goToLogin}
            size="lg"
            title="Loslegen"
          />

          <Pressable
            accessibilityRole="button"
            onPress={goToLogin}
            style={[styles.loginLink, compact && styles.loginLinkCompact]}
          >
            <Text style={[typography.timestamp, styles.loginLinkText]}>
              Schon dabei? <Text style={styles.loginLinkAction}>Anmelden</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Screen>
  );
}

function FeatureRow({
  icon,
  title,
  text,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  compact: boolean;
}) {
  return (
    <View style={[styles.featureRow, compact && styles.featureRowCompact]}>
      <View
        style={[styles.featureIcon, compact && styles.featureIconCompact]}
      >
        {icon}
      </View>
      <View style={styles.featureText}>
        <Text style={[typography.title, styles.featureTitle]}>{title}</Text>
        <Text style={[typography.timestamp, styles.featureBody]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    paddingTop: spacing.md,
  },
  scrollContentCompact: {
    gap: 6,
    paddingTop: 0,
  },
  headerBlock: {
    gap: 6,
  },
  wordmark: {
    color: colors.harborBlue,
    fontFamily: typography.display.fontFamily,
    fontSize: 30,
    lineHeight: 36,
  },
  wordmarkCompact: {
    fontSize: 26,
    lineHeight: 31,
  },
  tagline: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 23,
    lineHeight: 29,
  },
  taglineCompact: {
    fontSize: 20,
    lineHeight: 25,
  },
  intro: {
    color: colors.mistDark,
    fontFamily: typography.body.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    maxWidth: 320,
  },
  introCompact: {
    fontSize: 14,
    lineHeight: 19,
  },
  card: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    elevation: 2,
    gap: 6,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: 20,
    shadowColor: "#242424",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  cardCompact: {
    gap: 4,
    paddingBottom: 10,
    paddingTop: 14,
  },
  cardHeart: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    marginTop: -40,
    width: 40,
  },
  cardHeartCompact: {
    marginTop: -34,
  },
  cardTitle: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 19,
    lineHeight: 24,
    textAlign: "center",
  },
  cardTitleCompact: {
    fontSize: 18,
    lineHeight: 23,
  },
  cardSubtitle: {
    color: colors.mistDark,
    lineHeight: 19,
    textAlign: "center",
  },
  divider: {
    backgroundColor: colors.mistLight,
    height: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  rowDivider: {
    backgroundColor: colors.mistLight,
    height: StyleSheet.hairlineWidth,
    opacity: 0.6,
  },
  featureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 5,
  },
  featureRowCompact: {
    paddingVertical: 2,
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: colors.washSage,
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  featureIconCompact: {
    height: 36,
    width: 36,
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: colors.graphite,
  },
  featureBody: {
    color: colors.mistDark,
    lineHeight: 17,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  loginLinkCompact: {
    paddingVertical: 2,
  },
  loginLinkText: {
    color: colors.mistDark,
  },
  loginLinkAction: {
    color: colors.harborBlue,
    fontFamily: typography.title.fontFamily,
    textDecorationLine: "underline",
  },
});
