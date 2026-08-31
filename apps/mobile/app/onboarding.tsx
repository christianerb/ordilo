import { useRouter } from "expo-router";
import {
  ArrowRight,
  Camera,
  Check,
  UserPlus,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import { OrdiloButton, Screen } from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import { isOnboardingComplete } from "@/src/lib/family";
import {
  addMember,
  completeOnboarding,
  createFamily,
  listMembers,
  type MemberRow,
} from "@/src/lib/onboarding-actions";
import { ROLE_CHIPS } from "@/src/lib/onboarding";
import {
  stepEntering,
  stepExiting,
  type StepDirection,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { success } from "@/src/lib/feedback";

/**
 * The onboarding flow — a native 1:1 port of the web flow
 * (src/app/(app)/onboarding/onboarding-flow.tsx), same steps and copy:
 *
 * 1. "Wer seid ihr?" — family name + own first name, ONE submit.
 * 2. "Wer gehört dazu?" — optional quick-add loop with one-tap role
 *    chips; finishing is always one tap away.
 * 3. Ready springboard — straight into the first scan.
 *
 * The flow resumes where a previous run stopped: the app gate routes here
 * whenever the family exists but onboarding_completed_at is NULL, and this
 * screen then starts directly on the quick-add step with members loaded.
 */

type OnboardingStep = "family-name" | "add-member" | "ready";

const NETWORK_ERROR = "Das hat nicht geklappt. Bitte versuch's nochmal.";

export default function OnboardingScreen() {
  const router = useRouter();
  const { family, isLoading: familyLoading, refresh } = useFamily();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  // Overrides set by user actions; when absent, values derive from the
  // resolved family so a resumed run starts where it stopped (a family
  // without the completion marker continues on the quick-add step).
  const [stepChoice, setStepChoice] = useState<OnboardingStep | null>(null);
  const [stepDirection, setStepDirection] =
    useState<StepDirection>("forward");
  const [familyIdOverride, setFamilyIdOverride] = useState<string | null>(null);
  const [familyNameOverride, setFamilyNameOverride] = useState<string | null>(
    null,
  );
  const [members, setMembers] = useState<MemberRow[]>([]);

  const step: OnboardingStep =
    stepChoice ??
    (family && !isOnboardingComplete(family) ? "add-member" : "family-name");
  const familyId = familyIdOverride ?? family?.id ?? null;
  const familyName = familyNameOverride ?? family?.name ?? null;

  const [familyNameInput, setFamilyNameInput] = useState("");
  const [selfNameInput, setSelfNameInput] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");

  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersReloadKey, setMembersReloadKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing members when resuming into the quick-add step. A failed
  // load is shown with a retry — never silently treated as "no members",
  // which would invite duplicate people or hide who is already there.
  useEffect(() => {
    if (!familyId || step !== "add-member") return;
    let cancelled = false;
    void listMembers(familyId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setMembers(result.data);
        setMembersError(null);
      } else {
        setMembersError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per family, plus explicit retry
  }, [familyId, membersReloadKey]);

  // ---------------------------------------------------------------------------
  // Step 1: family + self in one submit
  // ---------------------------------------------------------------------------

  const handleFamilySubmit = useCallback(async () => {
    setValidationError(null);
    setServerError(null);

    if (!familyNameInput.trim()) {
      setValidationError("Bitte gib einen Familiennamen ein");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createFamily(familyNameInput);
      if (!result.success) {
        setServerError(result.error);
        return;
      }

      setFamilyIdOverride(result.data.id);
      setFamilyNameOverride(result.data.name);

      // The self-member is created in the same step (optional). A failure
      // must not strand the flow — it can be added on the next card.
      if (selfNameInput.trim()) {
        const selfResult = await addMember(result.data.id, {
          name: selfNameInput,
          is_self: true,
        });
        if (selfResult.success) {
          setMembers((prev) => [...prev, selfResult.data]);
        }
      }

      setFamilyNameInput("");
      setStepDirection("forward");
      setStepChoice("add-member");
    } catch {
      setServerError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }, [familyNameInput, selfNameInput]);

  // ---------------------------------------------------------------------------
  // Step 2: quick-add loop (stays on the card) + finish
  // ---------------------------------------------------------------------------

  const handleMemberSubmit = useCallback(async () => {
    setValidationError(null);
    setServerError(null);

    if (!memberName.trim()) {
      setValidationError("Bitte einen Namen eingeben");
      return;
    }
    if (!familyId) {
      setServerError(NETWORK_ERROR);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addMember(familyId, {
        name: memberName,
        role: memberRole || undefined,
      });
      if (!result.success) {
        setServerError(result.error);
        return;
      }

      setMembers((prev) => [...prev, result.data]);
      setMemberName("");
      setMemberRole("");
    } catch {
      setServerError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }, [familyId, memberName, memberRole]);

  // ---------------------------------------------------------------------------
  // Step 3: complete + springboard into the scanner
  // ---------------------------------------------------------------------------

  const finishOnboarding = useCallback(
    async (startsFirstScan: boolean) => {
      setServerError(null);
      if (!familyId) {
        setServerError(NETWORK_ERROR);
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await completeOnboarding(familyId, startsFirstScan);
        if (!result.success) {
          setServerError(result.error);
          return;
        }
        void success();
        // Refresh the family state so the app gate sees the completion
        // marker, then land in the app (scan opens on top when chosen).
        await refresh();
        router.replace("/(tabs)");
        if (startsFirstScan) {
          router.push("/scan");
        }
      } catch {
        setServerError(NETWORK_ERROR);
      } finally {
        setIsSubmitting(false);
      }
    },
    [familyId, refresh, router],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (familyLoading && !family) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.harborBlue} />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {step === "family-name" && (
            <Animated.View
              entering={stepEntering(stepDirection, reduceMotion)}
              exiting={stepExiting()}
              key="family-name"
              style={styles.stepBody}
            >
              <OnboardingProgress currentStep={1} />
              <MascotBubble>
                Hallo! Ich bin Ordilo und kümmere mich um eure
                Familienunterlagen — nichts geht verloren, keine Frist geht
                unter. Zwei kurze Fragen, dann geht&apos;s los.
              </MascotBubble>

              <View style={styles.card}>
                <View style={styles.fieldGroup}>
                  <Text style={[typography.title, styles.label]}>
                    Wie heißt eure Familie?
                  </Text>
                  <TextInput
                    accessibilityLabel="Familienname"
                    autoFocus
                    editable={!isSubmitting}
                    onChangeText={(value) => {
                      setFamilyNameInput(value);
                      if (validationError) setValidationError(null);
                      if (serverError) setServerError(null);
                    }}
                    placeholder="z. B. Familie Müller"
                    placeholderTextColor={colors.mistDark}
                    style={[
                      typography.body,
                      styles.input,
                      validationError ? styles.inputError : null,
                    ]}
                    value={familyNameInput}
                  />
                  {validationError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {validationError}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[typography.title, styles.label]}>
                    Und du?{" "}
                    <Text style={styles.labelHint}>
                      (dein Vorname, optional)
                    </Text>
                  </Text>
                  <TextInput
                    accessibilityLabel="Dein Vorname"
                    autoComplete="given-name"
                    editable={!isSubmitting}
                    onChangeText={setSelfNameInput}
                    placeholder="z. B. Anna"
                    placeholderTextColor={colors.mistDark}
                    style={[typography.body, styles.input]}
                    value={selfNameInput}
                  />
                  <Text style={[typography.label, styles.hint]}>
                    Das kannst du auch später ergänzen.
                  </Text>
                </View>

                {serverError ? <ErrorBanner message={serverError} /> : null}

                <OrdiloButton
                  disabled={isSubmitting}
                  icon={<ArrowRight color={colors.warmWhite} size={18} />}
                  onPress={() => void handleFamilySubmit()}
                  size="lg"
                  title={isSubmitting ? "Wird gespeichert…" : "Weiter"}
                />
              </View>
            </Animated.View>
          )}

          {step === "add-member" && (
            <Animated.View
              entering={stepEntering(stepDirection, reduceMotion)}
              exiting={stepExiting()}
              key="add-member"
              style={styles.stepBody}
            >
              <OnboardingProgress currentStep={2} />
              <MascotBubble>
                {familyName ? `Schön, ${familyName}!` : "Schön!"} Wer gehört
                noch dazu? Du kannst das auch jederzeit später ergänzen.
              </MascotBubble>

              <View style={styles.card}>
                {membersError ? (
                  <View style={styles.membersErrorBox}>
                    <ErrorBanner message={membersError} />
                    <OrdiloButton
                      onPress={() => {
                        setMembersError(null);
                        setMembersReloadKey((key) => key + 1);
                      }}
                      title="Liste erneut laden"
                      variant="ghost"
                    />
                  </View>
                ) : (
                  members.map((member) => (
                    <PersonRow key={member.id} member={member} />
                  ))
                )}

                <View style={styles.fieldGroup}>
                  <Text style={[typography.title, styles.label]}>Name</Text>
                  <TextInput
                    accessibilityLabel="Name der Person"
                    editable={!isSubmitting}
                    onChangeText={(value) => {
                      setMemberName(value);
                      if (validationError) setValidationError(null);
                      if (serverError) setServerError(null);
                    }}
                    placeholder="z. B. Emma"
                    placeholderTextColor={colors.mistDark}
                    style={[
                      typography.body,
                      styles.input,
                      validationError ? styles.inputError : null,
                    ]}
                    value={memberName}
                  />
                  {validationError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {validationError}
                    </Text>
                  ) : null}
                </View>

                <View
                  accessibilityLabel="Rolle wählen"
                  accessibilityRole="radiogroup"
                  style={styles.chipGroup}
                >
                  {ROLE_CHIPS.map((role) => {
                    const selected = memberRole === role;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={isSubmitting}
                        key={role}
                        onPress={() => setMemberRole(selected ? "" : role)}
                        style={[
                          styles.chip,
                          selected && styles.chipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            typography.timestamp,
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {role}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {serverError ? <ErrorBanner message={serverError} /> : null}

                <OrdiloButton
                  disabled={isSubmitting}
                  icon={<UserPlus color={colors.graphite} size={18} />}
                  onPress={() => void handleMemberSubmit()}
                  size="lg"
                  title={
                    isSubmitting ? "Wird gespeichert…" : "Person hinzufügen"
                  }
                  variant="outline"
                />

                <OrdiloButton
                  disabled={isSubmitting}
                  icon={<Check color={colors.warmWhite} size={18} />}
                  onPress={() => {
                    setStepDirection("forward");
                    setStepChoice("ready");
                  }}
                  size="lg"
                  title={
                    members.length > 0
                      ? "Fertig — los geht's"
                      : "Später — erstmal loslegen"
                  }
                />
              </View>
            </Animated.View>
          )}

          {step === "ready" && (
            <Animated.View
              entering={stepEntering(stepDirection, reduceMotion)}
              exiting={stepExiting()}
              key="ready"
              style={styles.stepBody}
            >
              <View style={styles.readyHeader}>
                <OrdiloCharacter size={88} />
                <Text style={[typography.display, styles.readyTitle]}>
                  {familyName
                    ? `${familyName} ist startklar!`
                    : "Alles startklar!"}
                </Text>
                <Text style={[typography.timestamp, styles.readyText]}>
                  Hol dir einen Brief vom Stapel — ich lese ihn, merke mir
                  alles Wichtige, und du kannst mich einfach danach fragen.
                </Text>
              </View>

              {serverError ? <ErrorBanner message={serverError} /> : null}

              <OrdiloButton
                disabled={isSubmitting}
                icon={<Camera color={colors.warmWhite} size={18} />}
                onPress={() => void finishOnboarding(true)}
                size="lg"
                title={
                  isSubmitting ? "Einen Moment…" : "Erstes Dokument scannen"
                }
              />
              <OrdiloButton
                disabled={isSubmitting}
                onPress={() => void finishOnboarding(false)}
                size="lg"
                title="Erstmal umschauen"
                variant="ghost"
              />
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

/** Mascot bubble — Ordilo speaking, one bubble per step. */
function MascotBubble({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bubble}>
      <View style={styles.bubbleAvatar}>
        <OrdiloMark size={24} />
      </View>
      <Text style={[typography.timestamp, styles.bubbleText]}>{children}</Text>
    </View>
  );
}

function OnboardingProgress({ currentStep }: { currentStep: 1 | 2 }) {
  return (
    <View
      accessibilityLabel={`Schritt ${currentStep} von 2`}
      accessibilityRole="progressbar"
      style={styles.progress}
    >
      <Text style={[typography.label, styles.hint]}>
        Schritt {currentStep} von 2
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: currentStep === 1 ? "50%" : "100%" },
          ]}
        />
      </View>
    </View>
  );
}

/** One added member — the mobile PersonCard equivalent. */
function PersonRow({ member }: { member: MemberRow }) {
  return (
    <View style={styles.personRow}>
      <View
        style={[
          styles.personAvatar,
          {
            backgroundColor: member.avatar_color ?? colors.harborBlue,
          },
        ]}
      >
        <Text style={styles.personInitial}>
          {member.name.trim().charAt(0).toUpperCase() || "?"}
        </Text>
      </View>
      <Text style={[typography.title, styles.personName]} numberOfLines={1}>
        {member.name}
      </Text>
      {member.role ? (
        <Text style={[typography.timestamp, styles.personRole]}>
          {member.role}
        </Text>
      ) : null}
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.lg,
  },
  stepBody: { gap: spacing.md },
  progress: { gap: spacing.xs },
  progressTrack: {
    backgroundColor: colors.mistLight,
    borderRadius: 999,
    height: 6,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: colors.harborBlue,
    borderRadius: 999,
    height: "100%",
  },
  bubble: {
    flexDirection: "row",
    gap: 12,
  },
  bubbleAvatar: {
    alignItems: "center",
    backgroundColor: "rgba(48, 84, 96, 0.1)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  bubbleText: {
    color: colors.graphite,
    flex: 1,
    lineHeight: 21,
    paddingTop: 6,
  },
  card: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  fieldGroup: { gap: spacing.sm },
  label: { color: colors.graphite },
  labelHint: { color: colors.mistDark, fontWeight: "400" },
  hint: { color: colors.mistDark },
  input: {
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.graphite,
    height: 48,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.destructive },
  errorText: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    fontWeight: "500",
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  chipText: { color: colors.graphite, fontWeight: "500" },
  chipTextSelected: { color: colors.warmWhite },
  personRow: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  personAvatar: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  personInitial: {
    color: colors.warmWhite,
    fontFamily: typography.title.fontFamily,
    fontSize: 14,
  },
  personName: { color: colors.graphite, flex: 1 },
  personRole: { color: colors.mistDark },
  membersErrorBox: {
    alignItems: "center",
    gap: spacing.sm,
  },
  errorBanner: {
    backgroundColor: "rgba(192, 57, 43, 0.05)",
    borderColor: "rgba(192, 57, 43, 0.3)",
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  errorBannerText: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    fontWeight: "500",
  },
  readyHeader: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  readyTitle: {
    color: colors.graphite,
    fontSize: 20,
    textAlign: "center",
  },
  readyText: {
    color: colors.mistDark,
    lineHeight: 20,
    maxWidth: 300,
    textAlign: "center",
  },
});
