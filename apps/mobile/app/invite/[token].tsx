import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileText,
  FolderHeart,
  Heart,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { OrdiloButton, Screen } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useFamily } from "@/src/lib/family-context";
import {
  acceptInvite,
  getInviteInfo,
  getInviteMergePreparation,
  mergeOwnedFamilyIntoInvite,
  resolveSignedInInviteState,
  type AcceptInviteResult,
  type InviteMergePreview,
} from "@/src/lib/invites";
import { useSession } from "@/src/lib/session";
import { getSupabase } from "@/src/lib/supabase";
import { validateLoginEmail } from "@/src/lib/validation";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Invite acceptance — native port of the web invite landing
 * (src/app/invite/[token]/). Reached via ordilo://invite/<token> (and
 * universal links once associated domains are configured).
 *
 * States mirror the web exactly:
 *   - email/sent (signed out): the code is requested FOR this invite, so
 *     typing it in accepts the invite right here — no second confirmation.
 *   - confirm (signed in): an explicit "Familie beitreten" click — a
 *     shared link must never join someone silently.
 *   - merge / empty_source: the invitee owns a family; the merge preview
 *     decides, with counts and a mandatory acknowledgment.
 *   - invalid / already_in_family / shared_source_family /
 *     source_processing: dedicated screens, same copy as the web.
 *
 * Every successful join leaves through /willkommen (single welcome
 * moment), and the inviter is notified via the web API (bearer token).
 */

const RESEND_COOLDOWN_SECONDS = 60;
const PROCESSING_RETRY_SECONDS = 15;

type InviteScreenState =
  | "loading"
  | "invalid"
  | "email"
  | "sent"
  | "confirm"
  | "merge"
  | "empty_source"
  | "already_in_family"
  | "shared_source_family"
  | "source_processing";

const SAGE = "#DDEBE5"; // --auth-sage from the web palette

/**
 * Route wrapper — remounts the flow when the token changes. A second
 * deep link while this route is mounted must never inherit the previous
 * invite's UI: without a remount, a confirmation naming family A could
 * stay visible while the (recreated) handlers already join family B.
 * The key forces a synchronous reset to the loading state.
 */
export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InviteScreen key={token} token={token} />;
}

function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const { session, isLoading: sessionLoading } = useSession();
  const { refresh } = useFamily();

  const [screen, setScreen] = useState<InviteScreenState>("loading");
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<InviteMergePreview | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [mergeAcknowledged, setMergeAcknowledged] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [processingCountdown, setProcessingCountdown] = useState(
    PROCESSING_RETRY_SECONDS,
  );

  const loginInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signedIn = !!session;

  /** Enter the processing state with a fresh countdown. */
  const enterSourceProcessing = useCallback(() => {
    setProcessingCountdown(PROCESSING_RETRY_SECONDS);
    setScreen("source_processing");
  }, []);

  // ---------------------------------------------------------------------------
  // Initial load + reloads (also the auto-retry of source_processing)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;

    void (async () => {
      const info = await getInviteInfo(token);
      if (cancelled) return;
      if (info.status !== "valid") {
        setScreen("invalid");
        return;
      }
      setFamilyName(info.familyName);

      if (!signedIn) {
        setScreen("email");
        return;
      }

      const resolved = await resolveSignedInInviteState(token);
      if (cancelled) return;
      setMergePreview(resolved.preview);
      if (resolved.state === "source_processing") {
        enterSourceProcessing();
      } else {
        setScreen(resolved.state);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, signedIn, sessionLoading, reloadKey, enterSourceProcessing]);

  // source_processing re-checks itself after 15 seconds (same as web).
  // The countdown resets where the state is entered (event handlers and
  // the async load callback) — never synchronously inside this effect.
  useEffect(() => {
    if (screen !== "source_processing") return;
    const countdown = setInterval(() => {
      setProcessingCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    const refreshTimer = setTimeout(() => {
      setProcessingCountdown(PROCESSING_RETRY_SECONDS);
      setScreen("loading");
      setReloadKey((key) => key + 1);
    }, PROCESSING_RETRY_SECONDS * 1000);
    return () => {
      clearInterval(countdown);
      clearTimeout(refreshTimer);
    };
  }, [screen]);

  useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
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

  /** Tell the inviter (best effort), then leave through the welcome flow. */
  const completeJoin = useCallback(
    async (notificationId?: string) => {
      if (notificationId) {
        void apiFetch("/api/family-invites/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId }),
        }).catch(() => {
          // The mail is a courtesy — the join already happened.
        });
      }
      await refresh();
      router.replace("/willkommen");
    },
    [refresh, router],
  );

  /**
   * Route an accept result to its screen — shared by the confirm click and
   * the code verification, so both entry points land on identical outcomes.
   * Returns true when it navigated away (callers keep their spinner).
   */
  const routeAcceptResult = useCallback(
    async (result: AcceptInviteResult): Promise<boolean> => {
      if (result.success) {
        await completeJoin(result.notificationId);
        return true;
      }

      if (
        result.reason === "already_in_family" ||
        result.reason === "invalid"
      ) {
        setScreen(result.reason);
        return false;
      }
      if (result.reason === "merge_required") {
        const preparation = await getInviteMergePreparation(token);
        if (!preparation.success) {
          setErrorMessage(preparation.error);
          return false;
        }
        // The family situation changed between the two calls: the join
        // already happened, or nothing is left to merge (re-render).
        if (preparation.state === "joined") {
          await completeJoin();
          return true;
        }
        if (preparation.state === "joinable") {
          setScreen("loading");
          setReloadKey((key) => key + 1);
          return true;
        }
        if (
          preparation.state === "merge" ||
          preparation.state === "empty_source"
        ) {
          setMergePreview(preparation.preview);
        }
        setScreen(preparation.state);
        return false;
      }
      if (result.reason === "shared_source_family") {
        setScreen(result.reason);
        return false;
      }
      if (result.reason === "source_processing") {
        enterSourceProcessing();
        return false;
      }
      setErrorMessage(result.error);
      return false;
    },
    [completeJoin, token, enterSourceProcessing],
  );

  // ---------------------------------------------------------------------------
  // Signed-out flow: email → code → accept (typing the code IS the consent)
  // ---------------------------------------------------------------------------

  async function sendInviteCode(targetEmail: string): Promise<boolean> {
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: targetEmail,
      });
      return !error;
    } catch {
      return false;
    }
  }

  async function handleSubmitEmail() {
    if (loginInFlightRef.current) return;

    const result = validateLoginEmail(email);
    if (!result.success) {
      setValidationError(result.error);
      return;
    }

    setValidationError(null);
    setErrorMessage(null);
    setSubmitting(true);
    loginInFlightRef.current = true;

    const ok = await sendInviteCode(result.data.email);
    if (!ok) {
      loginInFlightRef.current = false;
      setSubmitting(false);
      setErrorMessage("Das hat nicht geklappt. Bitte versuch's nochmal.");
      return;
    }

    setEmail(result.data.email);
    setScreen("sent");
    setSubmitting(false);
    loginInFlightRef.current = false;
    startCooldown();
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    const ok = await sendInviteCode(email);
    resendInFlightRef.current = false;
    if (!ok) {
      setErrorMessage(
        "Der Code konnte nicht gesendet werden. Bitte versuch's nochmal.",
      );
      return;
    }
    setCode("");
    setErrorMessage(null);
    startCooldown();
  }

  async function handleVerify() {
    const loginCode = code.trim();
    if (!/^\d{6}$/.test(loginCode)) {
      setErrorMessage("Bitte gib den 6-stelligen Code ein.");
      return;
    }

    setErrorMessage(null);
    setAccepting(true);

    const { error: verifyError } = await getSupabase().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: loginCode,
      type: "email",
    });

    if (verifyError) {
      setAccepting(false);
      setErrorMessage(
        "Der Code ist nicht gültig oder abgelaufen. Bitte hol dir einen neuen.",
      );
      return;
    }

    // The code was requested FOR this invite and typed in by hand — that is
    // the consent. Accept right here instead of a second confirmation.
    const navigated = await routeAcceptResult(await acceptInvite(token));
    if (!navigated) setAccepting(false);
  }

  // ---------------------------------------------------------------------------
  // Signed-in actions
  // ---------------------------------------------------------------------------

  async function handleAccept() {
    if (accepting) return;
    setAccepting(true);
    setErrorMessage(null);
    const navigated = await routeAcceptResult(await acceptInvite(token));
    if (!navigated) setAccepting(false);
  }

  async function handleMerge() {
    if (accepting) return;
    setAccepting(true);
    setErrorMessage(null);

    const result = await mergeOwnedFamilyIntoInvite(
      token,
      mergePreview?.fingerprint ?? "",
    );
    if (result.success) {
      await completeJoin(result.notificationId);
      return;
    }

    setAccepting(false);
    if (
      result.reason === "invalid" ||
      result.reason === "shared_source_family"
    ) {
      setScreen(result.reason);
      return;
    }
    if (result.reason === "source_processing") {
      enterSourceProcessing();
      return;
    }
    if (result.reason === "preview_changed") {
      setScreen("loading");
      setReloadKey((key) => key + 1);
      return;
    }
    setErrorMessage(result.error);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {screen === "loading" && (
            <View style={styles.centerBlock}>
              <ActivityIndicator color={colors.harborBlue} />
            </View>
          )}

          {screen === "invalid" && (
            <StateBlock
              icon={<Heart color={colors.mistDark} size={28} strokeWidth={1.75} />}
              title="Diese Einladung ist nicht mehr gültig"
            >
              <Text style={[typography.body, styles.stateText]}>
                Der Link ist abgelaufen oder wurde zurückgezogen. Bitte lass
                dir einen neuen Link schicken.
              </Text>
              <OrdiloButton
                onPress={() => router.replace("/(auth)/login")}
                size="lg"
                title="Zur Anmeldung"
                variant="outline"
              />
            </StateBlock>
          )}

          {screen === "already_in_family" && (
            <StateBlock
              icon={<UserPlus color={colors.harborBlue} size={28} strokeWidth={1.75} />}
              title="Du bist schon in einer Familie"
            >
              <Text style={[typography.body, styles.stateText]}>
                Ein Konto kann im Moment nur zu einer Familie gehören. Melde
                dich mit einer anderen E-Mail-Adresse an, um dieser Familie
                beizutreten.
              </Text>
              <OrdiloButton
                onPress={() => router.replace("/(tabs)")}
                size="lg"
                title="Zurück zu meiner Familie"
                variant="outline"
              />
            </StateBlock>
          )}

          {screen === "shared_source_family" && (
            <StateBlock
              icon={<UserPlus color={colors.harborBlue} size={28} strokeWidth={1.75} />}
              title="Deine Familie wird schon geteilt"
            >
              <Text style={[typography.body, styles.stateText]}>
                Mehrere Konten nutzen deine bisherige Familie. Deshalb können
                wir ihre Inhalte nicht automatisch in eine andere Familie
                verschieben.
              </Text>
              <OrdiloButton
                onPress={() => router.replace("/(tabs)")}
                size="lg"
                title="Zurück zu meiner Familie"
                variant="outline"
              />
            </StateBlock>
          )}

          {screen === "source_processing" && (
            <StateBlock
              icon={<ActivityIndicator color={colors.harborBlue} />}
              title="Fast fertig"
            >
              <Text style={[typography.body, styles.stateText]}>
                Einige deiner Dokumente werden noch vorbereitet. Danach
                kannst du deine Familie sicher zusammenführen.
              </Text>
              <Text style={[typography.timestamp, styles.stateText]}>
                Wir prüfen automatisch in {processingCountdown} Sekunden
                erneut.
              </Text>
              <OrdiloButton
                icon={<RefreshCw color={colors.warmWhite} size={16} />}
                onPress={() => {
                  setScreen("loading");
                  setReloadKey((key) => key + 1);
                }}
                size="lg"
                title="Jetzt nochmal prüfen"
              />
              <OrdiloButton
                onPress={() => router.replace("/(tabs)")}
                size="lg"
                title="Zu meiner Familie"
                variant="outline"
              />
            </StateBlock>
          )}

          {screen === "confirm" && (
            <StateBlock
              icon={<UserPlus color={colors.harborBlue} size={28} strokeWidth={1.75} />}
              title="Familie beitreten?"
            >
              <Text style={[typography.body, styles.stateText]}>
                {familyName
                  ? `Du bist eingeladen zu „${familyName}“. Willst du dieser Familie beitreten?`
                  : "Willst du dieser Familie beitreten?"}
              </Text>
              {errorMessage ? <ErrorNote message={errorMessage} /> : null}
              <OrdiloButton
                disabled={accepting}
                icon={<ArrowRight color={colors.warmWhite} size={20} />}
                onPress={() => void handleAccept()}
                size="lg"
                title={accepting ? "Wird beigetreten…" : "Familie beitreten"}
              />
              <OrdiloButton
                disabled={accepting}
                onPress={() => router.replace("/(tabs)")}
                size="lg"
                title="Abbrechen"
                variant="outline"
              />
            </StateBlock>
          )}

          {screen === "merge" && mergePreview && (
            <StateBlock
              icon={<UserPlus color={colors.harborBlue} size={28} strokeWidth={1.75} />}
              title="Deine Familie zusammenführen?"
            >
              <Text style={[typography.body, styles.stateText]}>
                Deine Inhalte aus{" "}
                <Text style={styles.stateTextStrong}>
                  „{mergePreview.sourceFamilyName}“
                </Text>{" "}
                ziehen zu{" "}
                <Text style={styles.stateTextStrong}>
                  „{familyName ?? "dieser Familie"}“
                </Text>
                . Danach gibt es nur noch diese gemeinsame Familie.
              </Text>

              <View style={styles.transferCard}>
                <View style={styles.transferSide}>
                  <Text style={[typography.label, styles.transferLabel]}>
                    Deine bisherige Familie
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[typography.timestamp, styles.transferName]}
                  >
                    „{mergePreview.sourceFamilyName}“
                  </Text>
                </View>
                <ArrowRight color={colors.harborBlue} size={20} />
                <View style={styles.transferSide}>
                  <Text style={[typography.label, styles.transferLabel]}>
                    Deine neue Familie
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[typography.timestamp, styles.transferName]}
                  >
                    „{familyName ?? "Ziel-Familie"}“
                  </Text>
                </View>
              </View>

              <View style={styles.countsCard}>
                <Text style={[typography.timestamp, styles.countsTitle]}>
                  Das wird übernommen
                </Text>
                <View style={styles.countsGrid}>
                  {[
                    {
                      label: "Dokumente",
                      count: mergePreview.documentCount,
                      icon: FileText,
                    },
                    {
                      label: "Aufgaben",
                      count: mergePreview.taskCount,
                      icon: ClipboardCheck,
                    },
                    {
                      label: "Termine",
                      count: mergePreview.calendarEventCount,
                      icon: CalendarDays,
                    },
                    {
                      label: "Personen",
                      count: mergePreview.memberCount,
                      icon: UserPlus,
                    },
                    {
                      label: "Sammlungen",
                      count: mergePreview.collectionCount,
                      icon: FolderHeart,
                    },
                  ]
                    .filter((item) => item.count > 0)
                    .map(({ label, count, icon: Icon }) => (
                      <View key={label} style={styles.countItem}>
                        <Icon color={colors.harborBlue} size={16} />
                        <Text style={[typography.timestamp, styles.countText]}>
                          {count} {label}
                        </Text>
                      </View>
                    ))}
                </View>
              </View>

              <View style={styles.sageNote}>
                <UsersRound color={colors.harborBlueDarker} size={16} />
                <Text style={styles.sageNoteText}>
                  <Text style={styles.sageNoteStrong}>Wichtig:</Text>{" "}
                  {mergePreview.targetAdultCount === 1
                    ? "Eine erwachsene Person"
                    : `${mergePreview.targetAdultCount} erwachsene Personen`}{" "}
                  in „{familyName ?? "dieser Familie"}“ können diese Inhalte
                  danach sehen. Deine bisherigen Chat-Verläufe werden nicht
                  übernommen und bleiben nicht erhalten.
                </Text>
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: mergeAcknowledged }}
                disabled={accepting}
                onPress={() => setMergeAcknowledged((current) => !current)}
                style={styles.checkboxRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    mergeAcknowledged && styles.checkboxChecked,
                  ]}
                >
                  {mergeAcknowledged ? (
                    <Check color={colors.warmWhite} size={14} strokeWidth={3} />
                  ) : null}
                </View>
                <Text style={[typography.timestamp, styles.checkboxText]}>
                  Ich verstehe: Meine bisherige Familie wird übernommen. Das
                  kann ich nicht rückgängig machen.
                </Text>
              </Pressable>

              {errorMessage ? <ErrorNote message={errorMessage} /> : null}
              <OrdiloButton
                disabled={accepting || !mergeAcknowledged}
                icon={<ArrowRight color={colors.warmWhite} size={20} />}
                onPress={() => void handleMerge()}
                size="lg"
                title={
                  accepting ? "Wird zusammengeführt…" : "Familie zusammenführen"
                }
              />
              <OrdiloButton
                disabled={accepting}
                onPress={() => router.replace("/(tabs)")}
                size="lg"
                title="Abbrechen"
                variant="outline"
              />
              <Text style={[typography.label, styles.cancelHint]}>
                Bei „Abbrechen“ bleibt alles wie es ist.
              </Text>
            </StateBlock>
          )}

          {screen === "empty_source" && mergePreview && (
            <StateBlock
              icon={<UserPlus color={colors.harborBlue} size={28} strokeWidth={1.75} />}
              title="Deiner Familie beitreten?"
            >
              <Text style={[typography.body, styles.stateText]}>
                Deine bisherige Familie ist leer. Du kannst direkt zu{" "}
                „{familyName ?? "dieser Familie"}“ wechseln.
              </Text>
              <View style={styles.sageNote}>
                <Text style={styles.sageNoteText}>
                  {mergePreview.targetAdultCount === 1
                    ? "Eine erwachsene Person in dieser Familie kann die gemeinsamen Inhalte sehen."
                    : `${mergePreview.targetAdultCount} erwachsene Personen in dieser Familie können die gemeinsamen Inhalte sehen.`}
                </Text>
              </View>
              {errorMessage ? <ErrorNote message={errorMessage} /> : null}
              <OrdiloButton
                disabled={accepting}
                icon={<ArrowRight color={colors.warmWhite} size={20} />}
                onPress={() => void handleMerge()}
                size="lg"
                title={accepting ? "Wird beigetreten…" : "Familie beitreten"}
              />
              <OrdiloButton
                disabled={accepting}
                onPress={() => router.replace("/(tabs)")}
                size="lg"
                title="Bei meiner Familie bleiben"
                variant="outline"
              />
              <Text style={[typography.label, styles.cancelHint]}>
                Bei „Bei meiner Familie bleiben“ wird nichts geändert.
              </Text>
            </StateBlock>
          )}

          {screen === "email" && (
            <View style={styles.formBody}>
              <View style={styles.inviteHeader}>
                <View style={styles.inviteKicker}>
                  <Heart color={colors.harborBlue} size={20} />
                  <Text style={[typography.timestamp, styles.inviteKickerText]}>
                    Familieneinladung
                  </Text>
                </View>
                <Text style={styles.stateTitle}>
                  {familyName
                    ? `Eingeladen zu „${familyName}“`
                    : "Du bist eingeladen"}
                </Text>
                <Text style={[typography.timestamp, styles.stateText]}>
                  Gib deine E-Mail-Adresse ein. Du bekommst einen
                  Anmelde-Code.
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[typography.title, styles.inputLabel]}>
                  E-Mail-Adresse
                </Text>
                <TextInput
                  accessibilityLabel="E-Mail-Adresse"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  autoFocus
                  editable={!submitting}
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setEmail(value);
                    if (validationError) setValidationError(null);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onSubmitEditing={() => void handleSubmitEmail()}
                  placeholder="du@beispiel.de"
                  placeholderTextColor={colors.mistDark}
                  returnKeyType="send"
                  style={[
                    typography.body,
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

              {errorMessage ? <ErrorNote message={errorMessage} /> : null}

              <OrdiloButton
                disabled={submitting || !email.trim()}
                icon={<ArrowRight color={colors.warmWhite} size={18} />}
                onPress={() => void handleSubmitEmail()}
                size="lg"
                title={submitting ? "Wird verschickt…" : "Familie beitreten"}
              />

              <View style={styles.sageNote}>
                <ShieldCheck color={colors.harborBlueDarker} size={18} />
                <Text style={styles.sageNoteText}>
                  <Text style={styles.sageNoteStrong}>
                    Anmelden und Registrieren sind dasselbe.
                  </Text>{" "}
                  Gibt es dein Konto noch nicht, legen wir es einfach an. Nach
                  der Anmeldung bist du direkt Teil der Familie.
                </Text>
              </View>
            </View>
          )}

          {screen === "sent" && (
            <View style={styles.formBody}>
              <StateBlock
                icon={<Mail color={colors.harborBlue} size={28} strokeWidth={1.75} />}
                title="Fast geschafft!"
              >
                <Text style={[typography.body, styles.stateText]}>
                  Wir haben einen 6-stelligen Code an{" "}
                  <Text style={styles.stateTextStrong}>{email}</Text>{" "}
                  geschickt. Gib ihn hier ein, dann bist du in der Familie.
                </Text>
              </StateBlock>

              <View style={styles.fieldGroup}>
                <Text style={[typography.title, styles.inputLabel]}>
                  Dein 6-stelliger Code
                </Text>
                <TextInput
                  accessibilityLabel="Anmelde-Code"
                  autoComplete="sms-otp"
                  autoFocus
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={setCode}
                  onSubmitEditing={() => void handleVerify()}
                  style={[typography.body, styles.codeInput]}
                  textContentType="oneTimeCode"
                  value={code}
                />
              </View>

              <View style={styles.secureNote}>
                <ShieldCheck color={colors.harborBlue} size={16} />
                <Text style={[typography.timestamp, styles.secureNoteText]}>
                  Sicher und verschlüsselt
                </Text>
              </View>

              {errorMessage ? <ErrorNote message={errorMessage} /> : null}

              <OrdiloButton
                disabled={accepting}
                onPress={() => void handleVerify()}
                size="lg"
                title={accepting ? "Wird geprüft…" : "Familie beitreten"}
              />

              <View style={styles.sentFooter}>
                <Text style={[typography.timestamp, styles.stateText]}>
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
                    onPress={() => {
                      loginInFlightRef.current = false;
                      setScreen("email");
                      setCode("");
                      setErrorMessage(null);
                    }}
                  >
                    <Text style={[typography.timestamp, styles.link]}>
                      Adresse ändern
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function StateBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stateBlock}>
      <View style={styles.stateIconCircle}>{icon}</View>
      <Text style={styles.stateTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.errorNote}>
      <Text style={styles.errorNoteText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  centerBlock: { alignItems: "center", paddingVertical: spacing["2xl"] },
  stateBlock: {
    alignItems: "center",
    gap: spacing.md,
  },
  stateIconCircle: {
    alignItems: "center",
    backgroundColor: SAGE,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  stateTitle: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  stateText: {
    color: colors.mistDark,
    lineHeight: 24,
    maxWidth: 320,
    textAlign: "center",
  },
  stateTextStrong: {
    color: colors.graphite,
    fontWeight: "600",
  },
  transferCard: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  transferSide: { flex: 1, minWidth: 0 },
  transferLabel: { color: colors.mistDark },
  transferName: {
    color: colors.graphite,
    fontWeight: "600",
    marginTop: 4,
  },
  countsCard: {
    alignSelf: "stretch",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  countsTitle: {
    color: colors.graphite,
    fontWeight: "500",
  },
  countsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  countItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    width: "47%",
  },
  countText: { color: colors.mistDark },
  sageNote: {
    alignSelf: "stretch",
    backgroundColor: SAGE,
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  sageNoteText: {
    color: colors.harborBlueDarker,
    flex: 1,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    lineHeight: 20,
  },
  sageNoteStrong: { fontWeight: "600" },
  checkboxRow: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.mistLight,
    borderRadius: 4,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    marginTop: 2,
    width: 18,
  },
  checkboxChecked: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  checkboxText: { color: colors.graphite, flex: 1, lineHeight: 20 },
  cancelHint: {
    color: colors.mistDark,
    textAlign: "center",
  },
  formBody: { gap: spacing.md },
  inviteHeader: { gap: spacing.sm },
  inviteKicker: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  inviteKickerText: {
    color: colors.harborBlue,
    fontWeight: "500",
  },
  fieldGroup: { gap: spacing.sm },
  inputLabel: { color: colors.graphite },
  input: {
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.graphite,
    height: 48,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.destructive },
  codeInput: {
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.graphite,
    fontSize: 24,
    height: 56,
    letterSpacing: 8,
    paddingHorizontal: spacing.md,
    textAlign: "center",
  },
  errorText: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    fontWeight: "500",
  },
  errorNote: {
    alignSelf: "stretch",
    backgroundColor: "rgba(192, 57, 43, 0.05)",
    borderColor: "rgba(192, 57, 43, 0.3)",
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  errorNoteText: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    fontWeight: "500",
    textAlign: "center",
  },
  secureNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  secureNoteText: { color: colors.mistDark },
  sentFooter: { alignItems: "center", gap: spacing.sm },
  sentActions: { flexDirection: "row", gap: spacing.lg },
  link: {
    color: colors.harborBlue,
    fontWeight: "500",
  },
  linkDisabled: { color: colors.mist },
});
