import * as SecureStore from "expo-secure-store";
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
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { Mail, ShieldCheck } from "lucide-react-native";

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

  const codeSent = formState === "sent" || formState === "verifying";

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.wordmarkBlock}>
            <Text style={styles.wordmark}>Ordilo</Text>
            <Text style={[typography.body, styles.claim]}>
              Die wichtigen Dinge deiner Familie. An einem Ort.
            </Text>
          </View>

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
                    <View style={styles.sentIconCircle}>
                      <Mail
                        color={colors.harborBlue}
                        size={28}
                        strokeWidth={1.75}
                      />
                    </View>
                    <Text style={[typography.display, styles.heading]}>
                      Fast geschafft!
                    </Text>
                    <Text style={[typography.body, styles.bodyText]}>
                      Wir haben einen 6-stelligen Code an{" "}
                      <Text style={styles.emailHighlight}>{email}</Text>{" "}
                      geschickt. Gib ihn hier ein, dann bist du drin.
                    </Text>
                  </View>

                  <Text style={[typography.label, styles.inputLabel]}>
                    Dein 6-stelliger Code
                  </Text>
                  <TextInput
                    accessibilityLabel="Anmelde-Code"
                    autoComplete="sms-otp"
                    autoFocus
                    keyboardType="number-pad"
                    maxLength={6}
                    onChangeText={setCode}
                    style={styles.codeInput}
                    textContentType="oneTimeCode"
                    value={code}
                  />

                  {errorMessage ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
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
                    <Text style={[typography.timestamp, styles.footerText]}>
                      Nichts angekommen? Schau auch im Spam-Ordner nach.
                    </Text>
                    <View style={styles.sentActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={resendCooldown > 0}
                        onPress={() => void handleResend()}
                      >
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
                      >
                        <Text style={[typography.timestamp, styles.link]}>
                          Adresse ändern
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.introBlock}>
                    <Text style={[typography.display, styles.heading]}>
                      Schön, dass du da bist
                    </Text>
                    <Text style={[typography.body, styles.bodyText]}>
                      Melde dich mit deiner E-Mail-Adresse an. Ein Passwort
                      brauchst du nicht.
                    </Text>
                  </View>

                  <View>
                    <Text style={[typography.label, styles.inputLabel]}>
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
                      style={[
                        styles.input,
                        validationError ? styles.inputError : null,
                      ]}
                      value={email}
                    />
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
                    onPress={() => void handleSendCode()}
                    size="lg"
                    title={
                      formState === "submitting"
                        ? "Wird verschickt…"
                        : "Loslegen — ohne Passwort"
                    }
                  />

                  <View style={styles.privacyNote}>
                    <ShieldCheck
                      color={colors.harborBlue}
                      size={18}
                      strokeWidth={1.75}
                    />
                    <Text style={[typography.label, styles.privacyText]}>
                      Anmelden und Registrieren sind dasselbe. Gibt es dein
                      Konto noch nicht, legen wir es einfach an.
                    </Text>
                  </View>
                </>
              )}
            </Animated.View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  wordmarkBlock: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  wordmark: {
    color: colors.harborBlue,
    fontFamily: typography.display.fontFamily,
    fontSize: 32,
    lineHeight: 38,
  },
  claim: {
    color: colors.mistDark,
  },
  form: {
    gap: spacing.md,
  },
  introBlock: {
    gap: spacing.sm,
  },
  heading: {
    color: colors.graphite,
  },
  bodyText: {
    color: colors.mistDark,
  },
  inputLabel: {
    color: colors.graphite,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: "transparent",
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    height: 48,
    paddingHorizontal: 12,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  codeInput: {
    alignSelf: "center",
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 28,
    height: 56,
    letterSpacing: 8,
    textAlign: "center",
    width: 220,
  },
  errorText: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
  },
  sentHeader: {
    alignItems: "center",
    gap: spacing.sm,
  },
  sentIconCircle: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  emailHighlight: {
    color: colors.graphite,
    fontFamily: typography.title.fontFamily,
  },
  sentFooter: {
    alignItems: "center",
    gap: spacing.sm,
  },
  footerText: {
    color: colors.mistDark,
    textAlign: "center",
  },
  sentActions: {
    flexDirection: "row",
    gap: spacing.lg,
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
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.sm,
    padding: 12,
  },
  privacyText: {
    color: colors.mistDark,
    flex: 1,
    lineHeight: 17,
  },
});
