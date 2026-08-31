import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
} from "lucide-react-native";

import { AmbientFields } from "@/src/components/ambient-fields";
import { AuthHeroIllustration } from "@/src/components/auth-hero-illustration";
import { MailSentIllustration } from "@/src/components/mail-sent-illustration";
import { OtpCodeInput } from "@/src/components/otp-code-input";
import { OrdiloButton, Screen } from "@/src/components/ui";
import { recordOnboardingStartedIfFirstTime } from "@/src/lib/analytics";
import { getSupabase } from "@/src/lib/supabase";
import { validateLoginEmail } from "@/src/lib/validation";
import {
  stepEntering,
  stepExiting,
  type StepDirection,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type FormState = "idle" | "submitting" | "sent" | "verifying" | "error";

// Expo SecureStore accepts only letters, digits, `.`, `-` and `_` in keys.
const PENDING_LOGIN_KEY = "ordilo.pending-login";
const PENDING_LOGIN_MAX_AGE_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_SECONDS = 60;

interface PendingLogin {
  email: string;
  sentAt: number;
}

async function savePendingLogin(email: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      PENDING_LOGIN_KEY,
      JSON.stringify({ email, sentAt: Date.now() } satisfies PendingLogin),
    );
  } catch {
    // Convenience only — the code flow works without persistence.
  }
}

async function clearPendingLogin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_LOGIN_KEY);
  } catch {
    // Convenience only.
  }
}

/**
 * Passwordless email-code login — the same flow as the web app
 * (signInWithOtp + verifyOtp with the 6-digit code), with native
 * keyboard, autofill (oneTimeCode) and a pending-code state that
 * survives the app being closed while the user fetches the mail.
 */
export default function LoginScreen() {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingLoginChecked, setPendingLoginChecked] = useState(false);
  const [animateFormChange, setAnimateFormChange] = useState(false);
  const [formDirection, setFormDirection] =
    useState<StepDirection>("forward");
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendInFlightRef = useRef(false);
  const router = useRouter();
  // Short screens (SE class) shrink the hero so field, button and the
  // supporting rows stay on one screen.
  const { height: viewportHeight } = useWindowDimensions();
  const heroScale = viewportHeight < 730 ? 0.75 : 1;

  function startCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
    setResendCooldown(seconds);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  // Restore an unfinished login: the user sent a code, left to fetch the
  // mail, and comes back to the code step instead of starting over.
  useEffect(() => {
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(PENDING_LOGIN_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw) as Partial<PendingLogin>;
        if (
          typeof pending.email !== "string" ||
          typeof pending.sentAt !== "number" ||
          Date.now() - pending.sentAt > PENDING_LOGIN_MAX_AGE_MS
        ) {
          await clearPendingLogin();
          return;
        }
        setEmail(pending.email);
        setFormState("sent");
        const elapsedSeconds = Math.floor((Date.now() - pending.sentAt) / 1000);
        const remaining = Math.max(0, RESEND_COOLDOWN_SECONDS - elapsedSeconds);
        if (remaining > 0) startCooldown(remaining);
      } catch {
        await clearPendingLogin();
      } finally {
        setPendingLoginChecked(true);
      }
    })();

    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  async function sendLoginCode(targetEmail: string): Promise<boolean> {
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: targetEmail,
      });
      return !error;
    } catch {
      return false;
    }
  }

  async function handleSendCode() {
    const result = validateLoginEmail(email);
    if (!result.success) {
      setValidationError(result.error);
      setFormState("idle");
      return;
    }

    setValidationError(null);
    setErrorMessage(null);
    setFormState("submitting");

    const ok = await sendLoginCode(result.data.email);
    if (!ok) {
      // Friendly German error — never surface raw Supabase errors.
      setErrorMessage("Das hat nicht geklappt. Bitte versuch's nochmal.");
      setFormState("error");
      return;
    }

    setEmail(result.data.email);
    void savePendingLogin(result.data.email);
    setFormDirection("forward");
    setAnimateFormChange(true);
    setFormState("sent");
    startCooldown();
  }

  async function handleResend() {
    // Guard synchronously: state updates lag a frame, so without the ref a
    // fast double-tap on a slow connection would send two codes and the
    // second one invalidates the first.
    if (resendCooldown > 0 || resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    try {
      const ok = await sendLoginCode(email);
      if (!ok) {
        setErrorMessage("Der Code konnte nicht gesendet werden. Bitte versuch's nochmal.");
        return;
      }
      setCode("");
      setErrorMessage(null);
      void savePendingLogin(email);
      startCooldown();
    } finally {
      resendInFlightRef.current = false;
    }
  }

  async function handleVerify() {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setErrorMessage("Bitte gib den 6-stelligen Code ein.");
      return;
    }

    Keyboard.dismiss();
    setErrorMessage(null);
    setFormState("verifying");

    const { data, error } = await getSupabase().auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      setErrorMessage("Der Code ist nicht gültig oder abgelaufen. Bitte hol dir einen neuen.");
      setFormState("sent");
      return;
    }

    // Activation funnel: the web login form records onboarding_started
    // for first-time users — same here, otherwise mobile signups would
    // enter the data mid-funnel. Invite joins verify on the invite
    // screen instead and are never first-time.
    if (data.user) {
      void recordOnboardingStartedIfFirstTime(getSupabase(), data.user.id);
    }

    // Success: onAuthStateChange picks up the session and the auth gate
    // in the root layout navigates into the app.
    await clearPendingLogin();
  }

  function handleChangeEmail() {
    setFormDirection("backward");
    setAnimateFormChange(true);
    setFormState("idle");
    setCode("");
    setErrorMessage(null);
    void clearPendingLogin();
  }

  // The intro screen pushed us; without a stack entry (deep link) the
  // intro is simply where "back" leads.
  function handleBackToIntro() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/einstieg");
    }
  }

  const codeSent = formState === "sent" || formState === "verifying";

  return (
    <Screen>
      <View style={styles.canvas}>
        <AmbientFields variant="top" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardAvoiding}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.sm),
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {pendingLoginChecked ? (
            <Animated.View
              entering={
                animateFormChange
                  ? stepEntering(formDirection, reduceMotion)
                  : undefined
              }
              exiting={stepExiting()}
              key={codeSent ? "code" : "email"}
              style={styles.form}
            >
              {codeSent ? (
                <>
                  <View style={styles.sentHeader}>
                    <MailSentIllustration />
                    <Text style={[typography.display, styles.headingCentered]}>
                      Fast geschafft!
                    </Text>
                    <Text style={[typography.body, styles.bodyTextCentered]}>
                      Wir haben einen 6-stelligen Code an{" "}
                      <Text style={styles.emailHighlight}>{email}</Text>{" "}
                      geschickt. Gib ihn hier ein, dann bist du drin.
                    </Text>
                  </View>

                  <OtpCodeInput
                    autoFocus
                    invalid={errorMessage !== null}
                    onChange={setCode}
                    value={code}
                  />

                  {errorMessage ? (
                    <Text
                      accessibilityRole="alert"
                      style={[styles.errorText, styles.errorTextCentered]}
                    >
                      {errorMessage}
                    </Text>
                  ) : null}

                  <OrdiloButton
                    disabled={formState === "verifying"}
                    onPress={() => void handleVerify()}
                    size="lg"
                    title={
                      formState === "verifying" ? "Wird geprüft…" : "Anmelden"
                    }
                  />

                  <View style={styles.sentFooter}>
                    <View style={styles.hintCard}>
                      <ShieldCheck
                        color={colors.harborBlue}
                        size={16}
                        strokeWidth={1.75}
                      />
                      <Text style={[typography.label, styles.hintText]}>
                        Nichts angekommen? Schau auch im Spam-Ordner nach.
                      </Text>
                    </View>
                    <View style={styles.sentActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={resendCooldown > 0}
                        onPress={() => void handleResend()}
                        style={styles.sentAction}
                      >
                        <RefreshCw
                          color={
                            resendCooldown > 0
                              ? colors.mistDark
                              : colors.harborBlue
                          }
                          size={14}
                          strokeWidth={2}
                        />
                        <Text
                          style={[
                            typography.timestamp,
                            styles.link,
                            resendCooldown > 0 && styles.linkDisabled,
                          ]}
                        >
                          {resendCooldown > 0
                            ? `Nochmal senden (${resendCooldown}s)`
                            : "Nochmal senden"}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleChangeEmail}
                        style={styles.sentAction}
                      >
                        <Pencil
                          color={colors.harborBlue}
                          size={13}
                          strokeWidth={2}
                        />
                        <Text style={[typography.timestamp, styles.link]}>
                          Adresse ändern
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.wordmark}>Ordilo</Text>

                  <AuthHeroIllustration scale={heroScale} variant="login" />

                  <View style={styles.introBlock}>
                    <Text style={[typography.display, styles.heading]}>
                      Schön, dass du da bist.
                    </Text>
                    <Text style={[typography.body, styles.bodyText]}>
                      Melde dich mit deiner E-Mail-Adresse an. Ein Passwort
                      brauchst du nicht.
                    </Text>
                  </View>

                  <View>
                    <View
                      style={[
                        styles.fieldBox,
                        validationError ? styles.inputError : null,
                      ]}
                    >
                      <Mail
                        color={colors.harborBlue}
                        size={20}
                        strokeWidth={1.75}
                      />
                      <View style={styles.fieldColumn}>
                        <Text style={[typography.label, styles.fieldLabel]}>
                          E-Mail-Adresse
                        </Text>
                        <TextInput
                          accessibilityLabel="E-Mail-Adresse"
                          autoCapitalize="none"
                          autoComplete="email"
                          autoCorrect={false}
                          autoFocus
                          keyboardType="email-address"
                          onChangeText={(value) => {
                            setEmail(value);
                            if (validationError) setValidationError(null);
                            if (formState === "error") {
                              setFormState("idle");
                              setErrorMessage(null);
                            }
                          }}
                          onSubmitEditing={() => void handleSendCode()}
                          placeholder="du@beispiel.de"
                          placeholderTextColor={colors.mistDark}
                          returnKeyType="send"
                          style={styles.fieldInput}
                          value={email}
                        />
                      </View>
                    </View>
                    {validationError ? (
                      <Text accessibilityRole="alert" style={styles.errorText}>
                        {validationError}
                      </Text>
                    ) : null}
                  </View>

                  {errorMessage && formState === "error" ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {errorMessage}
                    </Text>
                  ) : null}

                  <OrdiloButton
                    disabled={formState === "submitting"}
                    icon={
                      <ArrowRight color={colors.warmWhite} size={20} />
                    }
                    onPress={() => void handleSendCode()}
                    size="lg"
                    title={
                      formState === "submitting"
                        ? "Wird verschickt…"
                        : "Loslegen ohne Passwort"
                    }
                  />

                  <View style={styles.privacyNote}>
                    <View style={styles.privacyIcon}>
                      <ShieldCheck
                        color={colors.harborBlue}
                        size={20}
                        strokeWidth={1.75}
                      />
                    </View>
                    <View style={styles.privacyColumn}>
                      <Text style={[typography.title, styles.privacyTitle]}>
                        Anmelden und Registrieren sind dasselbe.
                      </Text>
                      <Text style={[typography.label, styles.privacyText]}>
                        Wenn es dein Konto noch nicht gibt, richten wir es
                        automatisch für dich ein. Sicher, vertraulich und
                        unkompliziert.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.lockHint}>
                    <View style={styles.lockCircle}>
                      <Lock color={colors.mistDark} size={12} strokeWidth={2} />
                    </View>
                    <Text style={[typography.label, styles.lockText]}>
                      Wir senden dir anschließend einen 6-stelligen Code per
                      E-Mail.
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleBackToIntro}
                    style={styles.backLink}
                  >
                    <ArrowLeft color={colors.mistDark} size={16} strokeWidth={2} />
                    <Text style={[typography.timestamp, styles.backLinkText]}>
                      Zurück zur Übersicht
                    </Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scrollContent: {
    // No vertical centering: centered overflow makes the tail of the
    // screen unreachable on short devices (SE with keyboard). The
    // layout flows from the top like the web auth pages.
    flexGrow: 1,
    paddingVertical: spacing.xl,
  },
  wordmark: {
    color: colors.harborBlue,
    fontFamily: typography.display.fontFamily,
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
  },
  form: {
    // Stretch explicitly — a content-sized form lets the privacy card's
    // title run past the screen edge instead of wrapping.
    alignSelf: "stretch",
    gap: spacing.md,
  },
  introBlock: {
    gap: spacing.sm,
  },
  heading: {
    color: colors.graphite,
    textAlign: "center",
  },
  bodyText: {
    color: colors.mistDark,
    textAlign: "center",
  },
  fieldBox: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  fieldColumn: {
    flex: 1,
    gap: 1,
  },
  fieldLabel: {
    color: colors.mistDark,
  },
  fieldInput: {
    color: colors.graphite,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    padding: 0,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  errorText: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
  },
  errorTextCentered: {
    textAlign: "center",
  },
  sentHeader: {
    alignItems: "center",
    gap: spacing.sm,
  },
  headingCentered: {
    color: colors.graphite,
    textAlign: "center",
  },
  bodyTextCentered: {
    color: colors.mistDark,
    textAlign: "center",
  },
  emailHighlight: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
  },
  sentFooter: {
    alignItems: "center",
    gap: spacing.md,
  },
  hintCard: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
  },
  hintText: {
    color: colors.mistDark,
  },
  sentActions: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  sentAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  link: {
    color: colors.harborBlue,
    fontFamily: typography.title.fontFamily,
  },
  linkDisabled: {
    color: colors.mistDark,
  },
  privacyNote: {
    alignItems: "flex-start",
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: 12,
    padding: spacing.md,
  },
  privacyIcon: {
    alignItems: "center",
    backgroundColor: colors.washSage,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  privacyColumn: {
    flex: 1,
    gap: 4,
  },
  privacyTitle: {
    color: colors.graphite,
    flexShrink: 1,
  },
  privacyText: {
    color: colors.mistDark,
    lineHeight: 17,
  },
  lockHint: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  lockCircle: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  lockText: {
    color: colors.mistDark,
    flexShrink: 1,
  },
  backLink: {
    alignItems: "center",
    alignSelf: "center",
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  backLinkText: {
    color: colors.mistDark,
  },
});
