import { useRouter } from "expo-router";
import {
  ArrowRight,
  Check,
  FileText,
  MoveRight,
  Receipt,
  ScanLine,
  Stethoscope,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

import { FadeInView, PressableScale } from "@/src/components/motion";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import { OrdiloButton, Screen } from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import { haptics } from "@/src/lib/haptics";
import { getSupabase } from "@/src/lib/supabase";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * The welcome flow for members who joined a family via invite — a native
 * port of the web welcome intro (src/app/willkommen/welcome-intro.tsx):
 * one arrival moment, then three passive cards that show the product
 * instead of describing it. Every step leaves a way out.
 *
 * Leaving writes mark_family_intro_seen and its result is checked (RPC
 * failures resolve instead of throwing). A failed write is not worth
 * blocking on: the dismissal is kept locally so the app gate cannot
 * loop, and worst case the intro shows once more (same as web).
 */

const CARD_COUNT = 3;
const SWIPE_THRESHOLD_PX = 48;

export default function WelcomeScreen() {
  const router = useRouter();
  const { family, refresh, markIntroSeenLocally } = useFamily();

  // 0 = arrival (celebration), 1–3 = the product cards.
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const isCard = step > 0;
  const isLastCard = step === CARD_COUNT;

  const leave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);

    // Supabase returns RPC failures in { error } rather than throwing —
    // check the result like the web action does (it also rejects the
    // "unauthenticated" status).
    let marked = false;
    try {
      const { data, error } = await getSupabase().rpc(
        "mark_family_intro_seen",
      );
      const status = (data as { status?: string } | null)?.status;
      marked = !error && status !== "unauthenticated";
    } catch {
      marked = false;
    }

    if (marked) {
      await refresh();
    } else {
      // Best effort: dismiss locally so the gate cannot bounce the user
      // back into a willkommen loop. Worst case the intro shows once
      // more in a later session — never block leaving.
      markIntroSeenLocally();
    }
    router.replace("/(tabs)");
  }, [leaving, refresh, markIntroSeenLocally, router]);

  const goTo = useCallback(
    (next: number) => {
      if (leaving) return;
      haptics.selection();
      setStep(Math.min(Math.max(next, 0), CARD_COUNT));
    },
    [leaving],
  );

  // Horizontal swipe flips cards; a vertical scroll must never do so
  // (axis lock — the gesture is decided by the first pixels).
  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _event: GestureResponderEvent,
        gesture: { dx: number; dy: number },
      ) =>
        Math.abs(gesture.dx) > SWIPE_THRESHOLD_PX &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gesture: { dx: number },
      ) => {
        if (gesture.dx < -SWIPE_THRESHOLD_PX) {
          setStep((current) => Math.min(current + 1, CARD_COUNT));
        } else if (gesture.dx > SWIPE_THRESHOLD_PX) {
          setStep((current) => Math.max(current - 1, 0));
        }
      },
    }),
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.body} {...panResponder.panHandlers}>
          {!isCard ? (
            <FadeInView index={0} key="arrival" style={styles.arrival}>
              <View style={styles.arrivalMark}>
                <OrdiloMark size={88} />
              </View>
              <Text style={styles.arrivalTitle}>Willkommen in der Familie</Text>
              <Text style={[typography.body, styles.arrivalText]}>
                Du bist jetzt Teil von „
                {family?.name ?? "eurer gemeinsamen Familie"}“. Alles
                Wichtige liegt ab jetzt gemeinsam an einem Ort.
              </Text>
              <View style={styles.arrivalActions}>
                <OrdiloButton
                  disabled={leaving}
                  icon={<ArrowRight color={colors.warmWhite} size={20} />}
                  onPress={() => goTo(1)}
                  size="lg"
                  title="Kurz zeigen, wie's funktioniert"
                />
                <PressableScale
                  accessibilityLabel={
                    leaving ? "Einen Moment…" : "Direkt loslegen"
                  }
                  disabled={leaving}
                  onPress={() => void leave()}
                  style={styles.textButton}
                >
                  <Text style={[typography.timestamp, styles.textButtonLabel]}>
                    {leaving ? "Einen Moment…" : "Direkt loslegen"}
                  </Text>
                </PressableScale>
              </View>
            </FadeInView>
          ) : (
            <FadeInView index={0} key="cards" style={styles.cards}>
              <Text style={[typography.label, styles.cardsKicker]}>
                So funktioniert Ordilo
              </Text>

              <FadeInView key={`card-${step}`}>
                <View
                  accessibilityLabel={`Karte ${step} von ${CARD_COUNT}`}
                  style={styles.cardFrame}
                >
                {step === 1 && (
                  <>
                    <DocumentRow
                      chip="Vertrag"
                      icon={FileText}
                      title="Kfz-Versicherung"
                    />
                    <DocumentRow
                      chip="Rechnung"
                      icon={Receipt}
                      title="Stromabschlag"
                    />
                    <DocumentRow
                      chip="Arztbrief"
                      icon={Stethoscope}
                      title="U9-Untersuchung"
                    />
                  </>
                )}
                {step === 2 && (
                  <View style={styles.scanRow}>
                    <ScannedLetter />
                    <MoveRight color={colors.mistDark} size={20} />
                    <View style={styles.scanChips}>
                      <RecognizedChip label="Frist: 31. März" />
                      <RecognizedChip label="Betrag: 128,40 €" />
                    </View>
                  </View>
                )}
                {step === 3 && (
                  <View style={styles.chatColumn}>
                    <View style={styles.chatQuestion}>
                      <Text style={styles.chatQuestionText}>
                        Wann läuft die Kfz-Versicherung ab?
                      </Text>
                    </View>
                    <View style={styles.chatAnswerRow}>
                      <View style={styles.chatAnswerAvatar}>
                        <OrdiloMark size={16} />
                      </View>
                      <View style={styles.chatAnswer}>
                        <Text style={styles.chatAnswerText}>
                          Am 31. März 2027.
                        </Text>
                        <View style={styles.chatSourceChip}>
                          <FileText color={colors.mistDark} size={12} />
                          <Text style={styles.chatSourceText}>
                            Kfz-Versicherung
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
                </View>
              </FadeInView>

              <FadeInView key={`text-${step}`} style={styles.cardText}>
                <Text style={styles.cardTitle}>
                  {step === 1 && "Alles an einem Ort"}
                  {step === 2 && "Abfotografieren reicht"}
                  {step === 3 && "Einfach fragen"}
                </Text>
                <Text style={[typography.timestamp, styles.cardBody]}>
                  {step === 1 &&
                    "Verträge, Rechnungen, Arztbriefe, Schulpost — gemeinsam an einem Ort statt verstreut in Schubladen und Postfächern."}
                  {step === 2 &&
                    "Du hältst einfach drauf. Ordilo liest das Dokument, sortiert es ein und merkt sich Fristen und Beträge."}
                  {step === 3 &&
                    "Frag in normalen Worten — Ordilo antwortet aus euren Dokumenten."}
                </Text>
              </FadeInView>

              <View
                accessibilityLabel="Karten wählen"
                accessibilityRole="radiogroup"
                style={styles.dots}
              >
                {Array.from({ length: CARD_COUNT }, (_, dot) => (
                  <Pressable
                    accessibilityLabel={`Karte ${dot + 1} von ${CARD_COUNT}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: dot === step - 1 }}
                    key={dot}
                    onPress={() => goTo(dot + 1)}
                    style={styles.dotButton}
                  >
                    <View
                      style={[
                        styles.dot,
                        dot === step - 1 && styles.dotActive,
                      ]}
                    />
                  </Pressable>
                ))}
              </View>

              <View style={styles.cardActions}>
                <OrdiloButton
                  disabled={leaving}
                  icon={<ArrowRight color={colors.warmWhite} size={20} />}
                  onPress={() =>
                    isLastCard ? void leave() : goTo(step + 1)
                  }
                  size="lg"
                  title={
                    leaving
                      ? "Einen Moment…"
                      : isLastCard
                        ? "Los geht's"
                        : "Weiter"
                  }
                />
                {!isLastCard && (
                  <PressableScale
                    accessibilityLabel="Überspringen"
                    disabled={leaving}
                    onPress={() => void leave()}
                    style={styles.textButton}
                  >
                    <Text
                      style={[typography.timestamp, styles.textButtonLabel]}
                    >
                      Überspringen
                    </Text>
                  </PressableScale>
                )}
              </View>
            </FadeInView>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Vignette building blocks — real UI shapes, purely decorative.
// ---------------------------------------------------------------------------

function DocumentRow({
  icon: Icon,
  title,
  chip,
}: {
  icon: typeof FileText;
  title: string;
  chip: string;
}) {
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentIconCircle}>
        <Icon color={colors.harborBlue} size={16} strokeWidth={1.75} />
      </View>
      <Text numberOfLines={1} style={styles.documentTitle}>
        {title}
      </Text>
      <View style={styles.documentChip}>
        <Text style={styles.documentChipText}>{chip}</Text>
      </View>
    </View>
  );
}

/** The little letter being scanned (card 2) — static scan line. */
function ScannedLetter() {
  return (
    <View style={styles.letter}>
      <View style={[styles.letterLine, { width: 40 }]} />
      <View style={[styles.letterLine, styles.letterLineSoft, { width: 56 }]} />
      <View style={[styles.letterLine, styles.letterLineSoft, { width: 48 }]} />
      <View style={[styles.letterLine, styles.letterLineSoft, { width: 56 }]} />
      <View style={[styles.letterLine, styles.letterLineSoft, { width: 36 }]} />
      <View style={styles.letterScanLine} />
      <ScanLine
        color={colors.harborBlue}
        size={16}
        strokeWidth={1.75}
        style={styles.letterScanIcon}
      />
    </View>
  );
}

function RecognizedChip({ label }: { label: string }) {
  return (
    <View style={styles.recognizedChip}>
      <View style={styles.recognizedCheck}>
        <Check color={colors.harborBlue} size={12} strokeWidth={2.5} />
      </View>
      <Text style={styles.recognizedText}>{label}</Text>
    </View>
  );
}

const SAGE = "#DDEBE5"; // --auth-sage from the web palette

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  body: { gap: spacing.lg },
  arrival: {
    alignItems: "center",
    gap: spacing.md,
  },
  arrivalMark: { marginBottom: spacing.sm },
  arrivalTitle: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  arrivalText: {
    color: colors.mistDark,
    lineHeight: 24,
    maxWidth: 300,
    textAlign: "center",
  },
  arrivalActions: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  textButton: {
    alignItems: "center",
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
  },
  textButtonLabel: {
    color: colors.mistDark,
    fontWeight: "500",
  },
  cards: { gap: spacing.lg },
  cardsKicker: {
    color: colors.mistDark,
    textAlign: "center",
  },
  cardFrame: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 20,
  },
  documentRow: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  documentIconCircle: {
    alignItems: "center",
    backgroundColor: SAGE,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  documentTitle: {
    color: colors.graphite,
    flex: 1,
    fontFamily: typography.title.fontFamily,
    fontSize: typography.timestamp.fontSize,
    fontWeight: "500",
  },
  documentChip: {
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  documentChipText: {
    color: colors.mistDark,
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
    fontWeight: "500",
  },
  scanRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  scanChips: { gap: spacing.sm },
  letter: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    height: 112,
    padding: 10,
    width: 88,
  },
  letterLine: {
    backgroundColor: colors.mistLight,
    borderRadius: 999,
    height: 6,
  },
  letterLineSoft: { backgroundColor: colors.sandWarm },
  letterScanLine: {
    backgroundColor: colors.warmApricot,
    borderRadius: 999,
    height: 2,
    left: 4,
    position: "absolute",
    right: 4,
    top: "50%",
  },
  letterScanIcon: {
    bottom: 6,
    position: "absolute",
    right: 6,
  },
  recognizedChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 4,
  },
  recognizedCheck: {
    alignItems: "center",
    backgroundColor: SAGE,
    borderRadius: 8,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  recognizedText: {
    color: colors.graphite,
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    fontWeight: "500",
  },
  chatColumn: { gap: 10 },
  chatQuestion: {
    alignSelf: "flex-end",
    backgroundColor: colors.harborBlue,
    borderBottomRightRadius: radii.sm,
    borderRadius: 16,
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  chatQuestionText: {
    color: colors.warmWhite,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.timestamp.fontSize,
    lineHeight: 20,
  },
  chatAnswerRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "85%",
  },
  chatAnswerAvatar: {
    alignItems: "center",
    backgroundColor: SAGE,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  chatAnswer: {
    backgroundColor: colors.warmWhite,
    borderBottomLeftRadius: radii.sm,
    borderColor: colors.mistLight,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  chatAnswerText: {
    color: colors.graphite,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.timestamp.fontSize,
    lineHeight: 20,
  },
  chatSourceChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chatSourceText: {
    color: colors.mistDark,
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
    fontWeight: "500",
  },
  cardText: { alignItems: "center", gap: spacing.sm },
  cardTitle: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  cardBody: {
    color: colors.mistDark,
    lineHeight: 20,
    maxWidth: 300,
    textAlign: "center",
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  dotButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    minWidth: 36,
  },
  dot: {
    backgroundColor: colors.mist,
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  dotActive: {
    backgroundColor: colors.harborBlue,
    width: 24,
  },
  cardActions: { gap: spacing.sm },
});
